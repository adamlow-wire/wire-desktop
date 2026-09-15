# Wire
# Copyright (C) 2026 Wire Swiss GmbH
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program. If not, see http://www.gnu.org/licenses/.
#

"""Run development E2E with an isolated native Secret Service, never plaintext storage."""

import os
from pathlib import Path
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import time


def stop(process):
    if process.poll() is None:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def stop_group(process):
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except ProcessLookupError:
        pass
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        pass
    try:
        os.killpg(process.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    process.wait()


def run_session(command):
    control = Path(os.environ['XDG_RUNTIME_DIR']) / 'keyring'
    control.mkdir(mode=0o700)
    with tempfile.TemporaryFile() as diagnostic:
        daemon = subprocess.Popen(
            ['gnome-keyring-daemon', '--foreground', '--unlock', '--components=secrets',
             '--control-directory=' + str(control)],
            stdin=subprocess.PIPE, stdout=diagnostic, stderr=diagnostic,
        )
        try:
            daemon.stdin.write(secrets.token_urlsafe(48).encode())
            daemon.stdin.close()
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if daemon.poll() is not None:
                    raise RuntimeError('The isolated native keyring exited before readiness.')
                owner = subprocess.run(
                    ['gdbus', 'call', '--session', '--dest', 'org.freedesktop.DBus',
                     '--object-path', '/org/freedesktop/DBus', '--method',
                     'org.freedesktop.DBus.NameHasOwner', 'org.freedesktop.secrets'],
                    capture_output=True, timeout=2, check=False,
                )
                if owner.returncode == 0 and owner.stdout.strip() == b'(true,)':
                    break
                time.sleep(0.1)
            else:
                raise RuntimeError('The isolated native Secret Service was not ready within ten seconds.')
            child = subprocess.Popen(command)
            try:
                return child.wait()
            finally:
                stop(child)
        finally:
            stop(daemon)


def main(argv):
    if not argv:
        raise ValueError('Usage: run-linux-e2e.py COMMAND [ARG ...]')
    if sys.platform != 'linux':
        raise RuntimeError('This native-keyring runner is only for Linux.')
    if argv[0] == '--session-child':
        if len(argv) == 1:
            raise ValueError('The session child requires a command.')
        return run_session(argv[1:])
    for executable in ['dbus-run-session', 'gdbus', 'gnome-keyring-daemon']:
        if shutil.which(executable) is None:
            raise RuntimeError('Required Linux test dependency is unavailable: ' + executable)
    with tempfile.TemporaryDirectory(prefix='wire-e2e-keyring-') as directory:
        root = Path(directory)
        env = dict(os.environ)
        for name, child in [('XDG_DATA_HOME', 'data'), ('XDG_CONFIG_HOME', 'config'), ('XDG_RUNTIME_DIR', 'runtime')]:
            target = root / child
            target.mkdir(mode=0o700)
            env[name] = str(target)
        env['XDG_CURRENT_DESKTOP'] = 'GNOME'
        for name in ['ELECTRON_RUN_AS_NODE', 'GNOME_KEYRING_CONTROL', 'GNOME_KEYRING_PID', 'DBUS_SESSION_BUS_ADDRESS']:
            env.pop(name, None)
        process = subprocess.Popen(
            ['dbus-run-session', '--', sys.executable, str(Path(__file__).resolve()), '--session-child', *argv],
            env=env, start_new_session=True,
        )
        try:
            return process.wait()
        finally:
            stop_group(process)


def interrupted(_signum, _frame):
    raise KeyboardInterrupt()


if __name__ == '__main__':
    signal.signal(signal.SIGTERM, interrupted)
    try:
        result = main(sys.argv[1:])
    except KeyboardInterrupt:
        result = 130
    except (OSError, RuntimeError, ValueError, subprocess.TimeoutExpired) as error:
        print(str(error), file=sys.stderr)
        result = 1
    sys.exit(result if result >= 0 else 128 - result)
