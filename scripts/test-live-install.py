import importlib.util
import io
import json
import unittest
from pathlib import Path
from unittest.mock import Mock
spec = importlib.util.spec_from_file_location('installer', Path(__file__).with_name('install-live-experiment.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class InstallationGate(unittest.TestCase):
    def device(self, live=None, running=False):
        d=Mock();d.base='http://device.invalid';d.shell.return_value='yingtian';d.exists.return_value=False
        d.rpc.return_value={'items':[{'running':running}]}
        d.opener.open.return_value=io.BytesIO(json.dumps(live or {'active':None}).encode())
        return d
    def test_live_task_not_reported_as_dsh_running_still_blocks_install(self):
        d=self.device({'active':{'phase':'working'}})
        with self.assertRaisesRegex(RuntimeError,'GPT Live'):
            module.install(d,{},lambda:{})
        d.command.assert_not_called()
    def test_unknown_live_status_fails_closed(self):
        d=self.device({'error':'unavailable'})
        with self.assertRaises(RuntimeError):module.install(d,{},lambda:{})
        d.command.assert_not_called()
    def test_dsh_task_blocks_before_native_checks(self):
        d=self.device(running=True)
        with self.assertRaises(RuntimeError):module.install(d,{},lambda:{})
        d.command.assert_not_called()
    def test_native_microphone_blocks_even_when_host_is_idle(self):
        d=self.device()
        with self.assertRaises(RuntimeError):module.install(d,{},lambda:{'live':{'phase':'connecting'}})
        d.command.assert_not_called()
    def test_display_lease_blocks_install(self):
        d=self.device()
        with self.assertRaises(RuntimeError):module.install(d,{},lambda:{'live':{'phase':'idle'},'fold':{'dual':{'leasedState':5,'working':False}}})
        d.command.assert_not_called()

if __name__=='__main__':unittest.main()
