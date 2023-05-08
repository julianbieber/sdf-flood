use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

use alsa::pcm::*;
use alsa::{Direction, Error, ValueOr};
use rustfft::num_complex::Complex32;
use rustfft::FftPlanner;

pub fn start(output: Arc<Mutex<Vec<f32>>>) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let device = start_capture("default").unwrap();
        let io = device.io_i16().unwrap();
        let mut chunk_buffer = vec![0i16; 315];
        let mut ring_buffer = RingBuffer::new(3150);

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(3150);
        loop {
            let start = Instant::now();
            io.readi(&mut chunk_buffer).unwrap();
            ring_buffer.add(&chunk_buffer);
            let mut c = ring_buffer.complex_vector(); // TODO no allocation
            fft.process(&mut c);
            let mut o = output.lock().unwrap();
            *o = c.iter().map(|f| f.re).collect();
            drop(o);
            dbg!(start.elapsed());
        }
    })
}

struct RingBuffer {
    buffer: Vec<i16>,
    current: usize,
}

impl RingBuffer {
    fn new(size: usize) -> Self {
        RingBuffer {
            buffer: vec![0; size],
            current: 0,
        }
    }

    fn add(&mut self, chunk: &[i16]) {
        for v in chunk {
            self.buffer[self.current] = *v;
            self.current += 1;
            self.current %= self.buffer.len();
        }
    }

    fn complex_vector(&self) -> Vec<Complex32> {
        let mut i = (self.current + 1) % self.buffer.len();
        let mut r = Vec::with_capacity(self.buffer.len());
        while i != self.current {
            r.push(Complex32 {
                re: self.buffer[i] as f32,
                im: 0.0,
            });
            i += 1;
            i %= self.buffer.len();
        }
        r.push(Complex32 {
            re: self.buffer[i] as f32,
            im: 0.0,
        });
        r
    }
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
