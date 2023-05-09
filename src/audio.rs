use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

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
        let mut ring_buffer = RingBuffer::new(length);

        let mut planner = FftPlanner::new();
        let fft = planner.plan_fft_forward(length);
        let scaling = length as f32;
        loop {
            io.readi(&mut chunk_buffer).unwrap();
            ring_buffer.add(&chunk_buffer);
            let mut c = ring_buffer.complex_vector();
            fft.process(&mut c);
            let mut o = output.lock().unwrap();
            o.iter_mut().zip(c.iter()).for_each(|(o, c)| {
                *o = c.re.sqrt() / scaling;
            });
            drop(o);
        }
    })
}

struct RingBuffer {
    buffer: Vec<i16>,
    current: usize,
    c: Vec<Complex32>,
}

impl RingBuffer {
    fn new(size: usize) -> Self {
        RingBuffer {
            buffer: vec![0; size],
            current: 0,
            c: Vec::with_capacity(size),
        }
    }

    fn add(&mut self, chunk: &[i16]) {
        for v in chunk {
            self.buffer[self.current] = *v;
            self.current += 1;
            self.current %= self.buffer.len();
        }
    }

    fn complex_vector(&mut self) -> &mut Vec<Complex32> {
        let mut i = (self.current + 1) % self.buffer.len();
        self.c.clear();
        while i != self.current {
            self.c.push(Complex32 {
                re: self.buffer[i] as f32,
                im: 0.0,
            });
            i += 1;
            i %= self.buffer.len();
        }
        self.c.push(Complex32 {
            re: self.buffer[i] as f32,
            im: 0.0,
        });
        &mut self.c
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
