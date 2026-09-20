#!/usr/bin/env python3
"""Exercise actual skill startup failure and cancellation policy without hardware."""
import importlib.util
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'android-shell/codex-skills/android-transcribe/scripts'))
import transcribe as t

class Proc:
    def __init__(self,code=None):self.code=code
    def poll(self):return self.code

class Fallback(unittest.TestCase):
    def run_start(self, mode='auto', codes=(None,), health=None):
        calls=[];stops=[]
        def spawn(argv,env,log):
            calls.append(argv[0]);return Proc(codes[len(calls)-1])
        with tempfile.TemporaryDirectory() as tmp, patch.object(t,'spawn',spawn), patch.object(t,'stop',lambda p:stops.append(p)), patch.object(t,'status'):
            result=t.start_asr({'asr':'optimized','asrCompatibility':'compatibility'},mode,['unused','-t','4'],{},Path(tmp),health or (lambda route:{'status':'ok'}))
        return result,calls,stops
    def test_optimized_success_does_not_start_compatibility(self):
        result,calls,stops=self.run_start();self.assertEqual(calls,['optimized']);self.assertEqual(stops,[]);self.assertEqual(result[1],'kleidiai')
    def test_dead_primary_is_stopped_before_single_fallback(self):
        result,calls,stops=self.run_start(codes=(132,None));self.assertEqual(calls,['optimized','compatibility']);self.assertEqual(len(stops),1);self.assertEqual([a['ok'] for a in result[2]],[False,True])
    def test_explicit_compatibility_skips_primary(self):
        result,calls,_=self.run_start(mode='compatibility');self.assertEqual(calls,['compatibility']);self.assertEqual(result[1],'compatibility')
    def test_both_fail_is_an_error(self):
        with self.assertRaisesRegex(RuntimeError,'failed to load'):self.run_start(codes=(132,1))
    def test_cancellation_is_not_a_reason_to_start_another_engine(self):
        calls=[];stops=[]
        with tempfile.TemporaryDirectory() as tmp, patch.object(t,'spawn',side_effect=lambda *args:calls.append(1) or Proc()), patch.object(t,'stop',side_effect=lambda p:stops.append(p)):
            def interrupt(route):raise KeyboardInterrupt()
            with self.assertRaises(KeyboardInterrupt):t.start_asr({'asr':'optimized','asrCompatibility':'compatibility'},'auto',['unused'],{},Path(tmp),interrupt)
        self.assertEqual(len(calls),1);self.assertEqual(len(stops),1)

if __name__=='__main__':unittest.main()
