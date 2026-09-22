/*
 * Wire
 * Copyright (C) 2026 Wire Swiss GmbH
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see http://www.gnu.org/licenses/.
 *
 */

import {BrowserWindow, desktopCapturer, ipcMain, MessageChannelMain, session} from 'electron';
import type {DesktopCapturerSource, Session, WebContents, WebFrameMain} from 'electron';

import {randomUUID} from 'node:crypto';
import path from 'node:path';

import {
  DISPLAY_BROKER_CAPABILITY,
  DISPLAY_BROKER_HEARTBEAT_CHANNEL,
  DISPLAY_BROKER_PORT_CHANNEL,
  DISPLAY_BROKER_READ_CHANNEL,
  DISPLAY_BROKER_SELECT_CHANNEL,
  DISPLAY_BROKER_STOP_CHANNEL,
  DISPLAY_CAPTURE_BEGIN_CHANNEL,
  DISPLAY_CAPTURE_CAPABILITY,
  DISPLAY_CAPTURE_ENDED_CHANNEL,
  DISPLAY_CAPTURE_LIMITS,
  DISPLAY_CAPTURE_PORT_CHANNEL,
  DISPLAY_CAPTURE_STOP_CHANNEL,
  DisplayBrokerChoices,
  DisplayCaptureRequest,
  DisplayCaptureStarted,
  isDisplayBrokerChoices,
  isDisplayCaptureRequest,
  isDisplayCaptureStarted,
  isDisplaySourceSelection,
  isEmptyDisplayRequest,
} from './DisplayCaptureContract';

import * as locale from '../../locale';
import {AuthorizedIpcContract, bindAuthorizedIpc} from '../../security/AuthorizedIpc';
import {LOCAL_CONTENT_ORIGIN} from '../../security/LocalContentPolicy';
import {installLocalContentProtocol} from '../../security/LocalContentProtocol';
import {bindNavigationGuard} from '../../security/NavigationGuard';
import {AuthorizedViewIdentity, registerViewIdentity, ViewIdentityRegistry} from '../../security/ViewIdentityRegistry';

export const DISPLAY_BROKER_URL = `${LOCAL_CONTENT_ORIGIN}/html/display-capture.html`;
export interface CaptureSource {
  readonly name: string;
  readonly thumbnail: string;
  readonly video: DesktopCapturerSource | WebFrameMain;
}
interface CaptureFlow {
  readonly id: string;
  readonly requestId: string;
  readonly identity: AuthorizedViewIdentity;
  readonly owner: WebContents;
  readonly window: BrowserWindow;
  readonly sourceChoices: Map<string, CaptureSource>;
  readonly resolve: (value: DisplayCaptureStarted) => void;
  readonly reject: (error: Error) => void;
  readonly cleanup: Array<() => void>;
  phase: 'loading' | 'choosing' | 'starting' | 'active' | 'ended';
  permissionUsed: boolean;
  displayUsed: boolean;
  choicesRead: boolean;
  selected?: CaptureSource;
  timer?: ReturnType<typeof setTimeout>;
}
interface CaptureOptions {
  readonly registry: ViewIdentityRegistry;
  readonly directory: string;
  readonly isEligible: (identity: AuthorizedViewIdentity) => boolean;
  readonly canApprove: (identity: AuthorizedViewIdentity) => boolean;
  readonly isForeground: (identity: AuthorizedViewIdentity) => boolean;
  readonly parentWindow: (identity: AuthorizedViewIdentity) => BrowserWindow | undefined;
  readonly requestingOrigin?: (identity: AuthorizedViewIdentity) => string;
  readonly sources?: () => Promise<readonly CaptureSource[]>;
}

const contract = <Request, Response>(
  channel: string,
  broker: boolean,
  isRequest: (value: unknown) => value is Request,
  isResponse: (value: unknown) => value is Response,
): AuthorizedIpcContract<Request, Response> => ({
  channel,
  capability: broker ? DISPLAY_BROKER_CAPABILITY : DISPLAY_CAPTURE_CAPABILITY,
  failureMode: 'reject',
  originPolicy: 'registered-view-origin',
  isRequest,
  isResponse,
  rateLimit: {
    maxRequests: channel === DISPLAY_CAPTURE_BEGIN_CHANNEL ? 4 : channel === DISPLAY_BROKER_HEARTBEAT_CHANNEL ? 90 : 30,
    windowMs: 60_000,
  },
  viewTypes: broker ? ['display-broker'] : ['account', 'picture-in-picture'],
});

/** Only a fixed local broker has native capture permission. Remote views receive an approved stream. */
export class DisplayCaptureCoordinator {
  private enumerationPending = false;
  private readonly flows = new Map<string, CaptureFlow>();
  private readonly pendingCleanup = new Map<string, CaptureFlow>();
  private readonly cleaning = new Set<string>();
  private readonly unbind: Array<() => void> = [];

  constructor(private readonly options: CaptureOptions) {
    const bind = <Request, Response>(
      policy: AuthorizedIpcContract<Request, Response>,
      handler: (identity: AuthorizedViewIdentity, request: Request) => Response | Promise<Response>,
    ): void => {
      this.unbind.push(bindAuthorizedIpc(ipcMain, options.registry, policy, handler));
    };
    bind(
      contract(DISPLAY_CAPTURE_BEGIN_CHANNEL, false, isDisplayCaptureRequest, isDisplayCaptureStarted),
      (identity, request) => this.begin(identity, request),
    );
    bind(
      contract(DISPLAY_CAPTURE_STOP_CHANNEL, false, isDisplayCaptureStarted, isEmptyDisplayRequest),
      (identity, request) => {
        const flow = this.flows.get(request.flowId);
        if (flow && flow.identity !== identity) {
          throw new Error('Display owner does not match.');
        }
        if (flow) {
          this.end(flow);
        }
      },
    );
    bind(contract(DISPLAY_BROKER_READ_CHANNEL, true, isEmptyDisplayRequest, isDisplayBrokerChoices), identity =>
      this.readChoices(this.brokerFlow(identity)),
    );
    bind(
      contract(DISPLAY_BROKER_SELECT_CHANNEL, true, isDisplaySourceSelection, isEmptyDisplayRequest),
      (identity, request) => this.select(this.brokerFlow(identity), request.choiceId),
    );
    bind(contract(DISPLAY_BROKER_HEARTBEAT_CHANNEL, true, isEmptyDisplayRequest, isEmptyDisplayRequest), identity => {
      const flow = this.brokerFlow(identity);
      if ((flow.phase !== 'starting' && flow.phase !== 'active') || !this.current(flow)) {
        this.end(flow);
        throw new Error('Display stream is no longer current.');
      }
      clearTimeout(flow.timer);
      flow.timer = setTimeout(() => this.end(flow), DISPLAY_CAPTURE_LIMITS.frameTimeoutMs);
    });
    bind(contract(DISPLAY_BROKER_STOP_CHANNEL, true, isEmptyDisplayRequest, isEmptyDisplayRequest), identity =>
      this.end(this.brokerFlow(identity)),
    );
  }

  revalidate(): void {
    for (const flow of [...this.flows.values(), ...this.pendingCleanup.values()]) {
      if (
        flow.phase === 'ended' ||
        !this.current(flow) ||
        (flow.phase !== 'active' && !this.options.canApprove(flow.identity))
      ) {
        this.end(flow);
      }
    }
  }

  dispose(): void {
    for (const flow of [...this.flows.values(), ...this.pendingCleanup.values()]) {
      this.end(flow);
    }
    for (const unbind of this.unbind.splice(0)) {
      unbind();
    }
  }

  private brokerFlow(identity: AuthorizedViewIdentity): CaptureFlow {
    const flow = [...this.flows.values()].find(candidate => candidate.window.webContents === identity.webContents);
    if (!flow || flow.phase === 'ended') {
      throw new Error('Display request is no longer active.');
    }
    return flow;
  }

  private current(flow: CaptureFlow): boolean {
    try {
      return (
        !flow.owner.isDestroyed() &&
        flow.owner.mainFrame === flow.identity.mainFrame &&
        this.options.registry.authorize(
          {sender: flow.owner, senderFrame: flow.owner.mainFrame},
          DISPLAY_CAPTURE_CAPABILITY,
        ) === flow.identity &&
        this.options.isEligible(flow.identity)
      );
    } catch {
      return false;
    }
  }

  private begin(identity: AuthorizedViewIdentity, request: DisplayCaptureRequest): Promise<DisplayCaptureStarted> {
    if (
      !this.options.isEligible(identity) ||
      !this.options.isForeground(identity) ||
      this.flows.size + this.pendingCleanup.size >= 4 ||
      [...this.flows.values(), ...this.pendingCleanup.values()].some(
        flow => flow.identity.accountId === identity.accountId,
      )
    ) {
      throw new Error('Display request is not available for this view.');
    }
    const parent = this.options.parentWindow(identity);
    if (!parent || parent.isDestroyed() || !parent.isVisible() || parent.isMinimized()) {
      throw new Error('Display request has no visible owning window.');
    }
    const captureSession = session.fromPartition(`wire-display-${randomUUID()}`, {cache: false});
    const uninstall = installLocalContentProtocol(captureSession, this.options.directory, 'display-broker');
    let window: BrowserWindow;
    try {
      window = new BrowserWindow({
        parent,
        width: 520,
        height: 600,
        minWidth: 420,
        minHeight: 220,
        show: false,
        autoHideMenuBar: true,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        title: locale.getText('displayCaptureTitle'),
        webPreferences: {
          session: captureSession,
          preload: path.join(this.options.directory, 'dist/preload/preload-display-broker.js'),
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          webviewTag: false,
          webSecurity: true,
          backgroundThrottling: false,
        },
      });
    } catch (error) {
      uninstall();
      throw error;
    }
    return new Promise<DisplayCaptureStarted>((resolve, reject) => {
      const flow: CaptureFlow = {
        id: randomUUID(),
        requestId: request.requestId,
        identity,
        owner: identity.webContents as WebContents,
        window,
        sourceChoices: new Map(),
        phase: 'loading',
        permissionUsed: false,
        displayUsed: false,
        choicesRead: false,
        resolve,
        reject,
        cleanup: [uninstall],
      };
      this.flows.set(flow.id, flow);
      try {
        const registration = registerViewIdentity(this.options.registry, {
          allowedOrigin: new URL(DISPLAY_BROKER_URL).origin,
          allowedUrl: DISPLAY_BROKER_URL,
          capabilities: [DISPLAY_BROKER_CAPABILITY],
          partition: `display:${flow.id}`,
          session: captureSession,
          viewType: 'display-broker',
          webContents: window.webContents,
        });
        flow.cleanup.push(registration.revoke);
        this.configurePermission(flow, captureSession);
        window.webContents.setWindowOpenHandler(() => ({action: 'deny'}));
        bindNavigationGuard(window.webContents, target => target === DISPLAY_BROKER_URL);
        captureSession.on('will-download', event => event.preventDefault());
        const ended = (): void => this.end(flow);
        const navigated = (_event: unknown, _url: string, sameDocument: boolean, mainFrame: boolean): void => {
          if (mainFrame && !sameDocument) {
            this.end(flow);
          }
        };
        const unavailable = (): void => {
          if (flow.phase !== 'active') {
            this.end(flow);
          }
        };
        flow.owner.on('destroyed', ended);
        flow.owner.on('render-process-gone', ended);
        flow.owner.on('did-start-navigation', navigated);
        parent.on('hide', unavailable);
        parent.on('minimize', unavailable);
        flow.cleanup.push(() => {
          flow.owner.removeListener('destroyed', ended);
          flow.owner.removeListener('render-process-gone', ended);
          flow.owner.removeListener('did-start-navigation', navigated);
          parent.removeListener('hide', unavailable);
          parent.removeListener('minimize', unavailable);
        });
        window.once('closed', ended);
        window.on('unresponsive', ended);
        window.on('hide', ended);
        window.webContents.once('render-process-gone', ended);
        window.webContents.on('did-start-navigation', (_event, _url, sameDocument, mainFrame) => {
          if (mainFrame && !sameDocument && flow.phase !== 'loading') {
            this.end(flow);
          }
        });
        flow.timer = setTimeout(ended, DISPLAY_CAPTURE_LIMITS.promptTimeoutMs);
        void window.loadURL(DISPLAY_BROKER_URL).then(() => {
          if (flow.phase !== 'loading' || !this.current(flow) || !this.options.isForeground(identity)) {
            this.end(flow);
            return;
          }
          flow.phase = 'choosing';
          window.show();
          window.focus();
        }, ended);
      } catch {
        this.end(flow);
      }
    });
  }

  private configurePermission(flow: CaptureFlow, target: Session): void {
    const exactBroker = (contents: WebContents | null): boolean => {
      try {
        return (
          flow.phase === 'starting' &&
          !flow.window.isDestroyed() &&
          contents === flow.window.webContents &&
          !contents.isDestroyed() &&
          contents.getURL() === DISPLAY_BROKER_URL &&
          this.current(flow)
        );
      } catch {
        return false;
      }
    };
    target.setPermissionCheckHandler((contents, permission) => permission === 'media' && exactBroker(contents));
    target.setPermissionRequestHandler((contents, permission, callback, details) => {
      const allowed =
        permission === 'media' &&
        exactBroker(contents) &&
        !flow.permissionUsed &&
        details.isMainFrame === true &&
        'mediaTypes' in details &&
        Array.isArray(details.mediaTypes) &&
        details.mediaTypes.length === 0;
      if (allowed) {
        flow.permissionUsed = true;
      }
      callback(allowed);
    });
    target.setDisplayMediaRequestHandler((request, callback) => {
      const allowed =
        exactBroker(flow.window.webContents) &&
        flow.permissionUsed &&
        !flow.displayUsed &&
        request.frame === flow.window.webContents.mainFrame &&
        request.videoRequested &&
        !request.audioRequested &&
        request.userGesture &&
        flow.selected;
      if (!allowed) {
        callback({});
        return;
      }
      flow.displayUsed = true;
      callback({video: flow.selected!.video});
    });
  }

  private async readChoices(flow: CaptureFlow): Promise<DisplayBrokerChoices> {
    // The preload can request its initial model before loadURL's promise has settled.
    if (flow.phase !== 'loading' && flow.phase !== 'choosing') {
      throw new Error('Source selection is unavailable.');
    }
    if (flow.choicesRead) {
      throw new Error('Source choices have already been read.');
    }
    if (this.enumerationPending) {
      this.end(flow);
      throw new Error('A display source request is already pending.');
    }
    this.enumerationPending = true;
    flow.choicesRead = true;
    try {
      const sources = this.options.sources
        ? await this.options.sources()
        : (
            await desktopCapturer.getSources({
              types: ['screen', 'window'],
              thumbnailSize: {width: 320, height: 180},
              fetchWindowIcons: false,
            })
          ).map(video => ({video, name: video.name, thumbnail: video.thumbnail.toDataURL()}));
      if (!this.current(flow) || !this.flows.has(flow.id) || sources.length > DISPLAY_CAPTURE_LIMITS.maximumSources) {
        throw new Error('Display source request expired.');
      }
      const choices: DisplayBrokerChoices = {
        origin: this.options.requestingOrigin?.(flow.identity) ?? flow.identity.allowedOrigin,
        labels: {
          title: locale.getText('displayCaptureTitle'),
          loading: locale.getText('displayCaptureLoading'),
          choose: locale.getText('displayCaptureChoose'),
          empty: locale.getText('displayCaptureEmpty'),
          starting: locale.getText('displayCaptureStarting'),
          sharing: locale.getText('displayCaptureSharing'),
          stop: locale.getText('displayCaptureStop'),
          cancel: locale.getText('promptCancel'),
        },
        sources: sources.map(source => {
          const choiceId = randomUUID();
          flow.sourceChoices.set(choiceId, source);
          return {choiceId, name: source.name, thumbnail: source.thumbnail};
        }),
      };
      if (!isDisplayBrokerChoices(choices)) {
        throw new Error('Display sources are invalid.');
      }
      return choices;
    } catch {
      this.end(flow);
      throw new Error('Display sources could not be loaded.');
    } finally {
      this.enumerationPending = false;
    }
  }

  private async select(flow: CaptureFlow, choiceId: string): Promise<void> {
    const selected = flow.sourceChoices.get(choiceId);
    if (
      flow.phase !== 'choosing' ||
      !selected ||
      !this.current(flow) ||
      !this.options.canApprove(flow.identity) ||
      !flow.window.isFocused()
    ) {
      this.end(flow);
      throw new Error('Display source selection is no longer available.');
    }
    flow.selected = selected;
    flow.phase = 'starting';
    clearTimeout(flow.timer);
    flow.timer = setTimeout(() => this.end(flow), DISPLAY_CAPTURE_LIMITS.frameTimeoutMs);
    try {
      const channel = new MessageChannelMain();
      const ownedPorts = new Set([channel.port1, channel.port2]);
      for (const port of ownedPorts) {
        flow.cleanup.push(() => {
          if (ownedPorts.has(port)) {
            port.close();
            ownedPorts.delete(port);
          }
        });
      }
      flow.window.webContents.mainFrame.postMessage(DISPLAY_BROKER_PORT_CHANNEL, undefined, [channel.port1]);
      ownedPorts.delete(channel.port1);
      flow.owner.mainFrame.postMessage(DISPLAY_CAPTURE_PORT_CHANNEL, {requestId: flow.requestId, flowId: flow.id}, [
        channel.port2,
      ]);
      ownedPorts.delete(channel.port2);
      const started = await flow.window.webContents.executeJavaScript('window.wireCaptureBroker.start()', true);
      if (started !== true || flow.phase !== 'starting' || !this.current(flow) || !flow.displayUsed) {
        throw new Error('Display source did not start.');
      }
      flow.phase = 'active';
      // Keep the Stop window available if the owning account window is minimized or hidden.
      flow.window.setParentWindow(null);
      // A main-process deadline remains armed; a hung broker cannot keep capture alive.
      flow.sourceChoices.clear();
      flow.resolve({flowId: flow.id});
    } catch {
      this.end(flow);
      throw new Error('Display source did not start.');
    }
  }

  private end(flow: CaptureFlow): void {
    if (this.cleaning.has(flow.id) || (flow.phase === 'ended' && !this.pendingCleanup.has(flow.id))) {
      return;
    }
    this.cleaning.add(flow.id);
    try {
      if (flow.phase !== 'ended') {
        flow.phase = 'ended';
        this.flows.delete(flow.id);
        this.pendingCleanup.set(flow.id, flow);
        clearTimeout(flow.timer);
        flow.sourceChoices.clear();
        flow.selected = undefined;
        flow.reject(new Error('Display capture was cancelled or ended.'));
        try {
          if (!flow.owner.isDestroyed() && flow.owner.mainFrame === flow.identity.mainFrame) {
            flow.owner.mainFrame.postMessage(DISPLAY_CAPTURE_ENDED_CHANNEL, {flowId: flow.id});
          }
        } catch {
          /* The requesting document may already be gone. */
        }
      }
      let failed = false;
      const attempt = (cleanup: () => void): boolean => {
        try {
          cleanup();
          return true;
        } catch {
          failed = true;
          return false;
        }
      };
      attempt(() => {
        if (!flow.window.isDestroyed()) {
          flow.window.destroy();
        }
      });
      const remaining: Array<() => void> = [];
      for (const cleanup of flow.cleanup.splice(0).reverse()) {
        if (!attempt(cleanup)) {
          remaining.unshift(cleanup);
        }
      }
      flow.cleanup.push(...remaining);
      if (!failed) {
        this.pendingCleanup.delete(flow.id);
      } else {
        try {
          console.warn('Display capture cleanup failed.');
        } catch {
          // Reporting must not interrupt cancellation or other flow cleanup.
        }
      }
    } finally {
      this.cleaning.delete(flow.id);
    }
  }
}
