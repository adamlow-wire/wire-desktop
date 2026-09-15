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

"""Exercise private-session isolation, failure propagation and owned cleanup."""

import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest

RUNNER = Path(__file__).with_name('run-linux-e2e.py')


class PrivateSessionTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='wire-runner-test-')
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.report = self.root / 'report.json'

    def command(self, code):
        return [sys.executable, str(RUNNER), sys.executable, '-c', code, str(self.report)]

    def test_native_service_is_private_and_child_failure_is_preserved(self):
        code = '''import json,os,pathlib,subprocess,sys
root=pathlib.Path(os.environ['XDG_RUNTIME_DIR']).parent
owner=subprocess.run(['gdbus','call','--session','--dest','org.freedesktop.DBus','--object-path','/org/freedesktop/DBus','--method','org.freedesktop.DBus.NameHasOwner','org.freedesktop.secrets'],capture_output=True,check=True)
assert owner.stdout.strip()==b'(true,)'
assert os.environ['DBUS_SESSION_BUS_ADDRESS']!='unix:path=/deliberately-unavailable-parent-bus'
assert 'ELECTRON_RUN_AS_NODE' not in os.environ
assert 'GNOME_KEYRING_CONTROL' not in os.environ
assert 'GNOME_KEYRING_PID' not in os.environ
assert root.stat().st_mode & 0o777 == 0o700
assert all((root/name).stat().st_mode & 0o777 == 0o700 for name in ['data','config','runtime'])
pathlib.Path(sys.argv[1]).write_text(json.dumps({'root':str(root)}))
sys.exit(7)
'''
        environment = dict(os.environ, ELECTRON_RUN_AS_NODE='1',
                           DBUS_SESSION_BUS_ADDRESS='unix:path=/deliberately-unavailable-parent-bus',
                           GNOME_KEYRING_CONTROL='/deliberately-unavailable-control', GNOME_KEYRING_PID='0')
        result = subprocess.run(self.command(code), env=environment, capture_output=True, text=True, timeout=25)
        self.assertEqual(result.returncode, 7, result.stderr)
        self.assertFalse(Path(json.loads(self.report.read_text())['root']).exists())

    def test_missing_native_dependency_fails_before_running_the_command(self):
        executable_directory = self.root / 'empty-bin'
        executable_directory.mkdir()
        result = subprocess.run(self.command('import pathlib,sys; pathlib.Path(sys.argv[1]).touch()'),
                                env=dict(os.environ, PATH=str(executable_directory)),
                                capture_output=True, text=True, timeout=5)
        self.assertEqual(result.returncode, 1)
        self.assertIn('Required Linux test dependency is unavailable', result.stderr)
        self.assertFalse(self.report.exists())

    def test_termination_stops_owned_child_and_removes_private_directories(self):
        code = '''import json,os,pathlib,sys,time
report=pathlib.Path(sys.argv[1]); temporary=report.with_suffix('.tmp')
temporary.write_text(json.dumps({'root':str(pathlib.Path(os.environ['XDG_RUNTIME_DIR']).parent),'pid':os.getpid()})); temporary.replace(report)
time.sleep(120)
'''
        process = subprocess.Popen(self.command(code), stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
        try:
            deadline = time.monotonic() + 15
            while not self.report.exists() and time.monotonic() < deadline:
                if process.poll() is not None:
                    self.fail('Runner exited before starting its owned child: ' + process.stderr.read())
                time.sleep(0.05)
            self.assertTrue(self.report.exists(), 'Owned child did not start within the readiness budget')
            evidence = json.loads(self.report.read_text())
            process.send_signal(signal.SIGTERM)
            _, errors = process.communicate(timeout=12)
            self.assertEqual(process.returncode, 130, errors)
            self.assertFalse(Path(evidence['root']).exists())
            with self.assertRaises(ProcessLookupError):
                os.kill(evidence['pid'], 0)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait()
            process.stderr.close()


if __name__ == '__main__':
    unittest.main()
