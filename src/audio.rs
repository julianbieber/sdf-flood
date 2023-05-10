use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;

use alsa::pcm::*;
use alsa::{Direction, Error, ValueOr};
use rustfft::num_complex::Complex32;
use rustfft::FftPlanner;

pub fn start(output: Arc<Mutex<Vec<f32>>>) -> JoinHandle<()> {
    let length = output.lock().unwrap().len();
    std::thread::spawn(move || {
        let device = start_capture("default").unwrap();
        let io = device.io_i16().unwrap();
        let mut chunk_buffer = vec![0i16; length];
        let mut complex_buffer = vec![Complex32 { re: 0.0, im: 0.0 }; length];

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(length);
        let scaling = length as f32;
        loop {
            io.readi(&mut chunk_buffer).unwrap();
            for (c, v) in complex_buffer.iter_mut().zip(chunk_buffer.iter()) {
                c.re = *v as f32;
                c.im = 0.0;
            }

            fft.process(&mut complex_buffer);
            let mut o = output.lock().unwrap();
            o.iter_mut().zip(complex_buffer.iter()).for_each(|(o, c)| {
                *o = c.re.sqrt() / scaling;
            });
            drop(o);
        }
    })
}

fn start_capture(device: &str) -> Result<PCM, Error> {
    let pcm = PCM::new(device, Direction::Capture, false)?;
    {
        // For this example, we assume 44100Hz, one channel, 16 bit audio.
        let hwp = HwParams::any(&pcm)?;
        hwp.set_channels(1)?;
        hwp.set_rate(44100, ValueOr::Nearest)?;
        hwp.set_format(Format::s16())?;
        hwp.set_access(Access::RWInterleaved)?;
        pcm.hw_params(&hwp)?;
    }
    pcm.start()?;
    Ok(pcm)
}
