use std::sync::{Arc, Mutex};

use rustfft::num_complex::Complex32;
use rustfft::FftPlanner;

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};

pub fn start(output: Arc<Mutex<Vec<f32>>>) -> Stream {
    let length = output.lock().unwrap().len();
    let host = cpal::default_host();
    let input_device = host
        .default_input_device()
        .expect("No input device available");

    let config = StreamConfig {
        channels: 1,                          // Number of audio channels (e.g., mono or stereo)
        sample_rate: cpal::SampleRate(44100), // Sample rate in Hz
        buffer_size: cpal::BufferSize::Fixed(length as u32 * 4), // Buffer size
    };

    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(length);
    let scaling = length as f32;
    let mut complex_buffer = vec![Complex32 { re: 0.0, im: 0.0 }; length];
    let stream = input_device
        .build_input_stream(
            &config,
            move |data: &[i16], _: &_| {
                for (c, v) in complex_buffer.iter_mut().zip(data.iter()) {
                    c.re = *v as f32;
                    c.im = 0.0;
                }

                fft.process(&mut complex_buffer);
                let mut o = output.lock().unwrap();
                o.iter_mut().zip(complex_buffer.iter()).for_each(|(o, c)| {
                    *o = c.l1_norm() / scaling; //.re.sqrt() / scaling;
                });
                drop(o);
            },
            |err| eprintln!("Error in audio stream: {:?}", err),
            None,
        )
        .unwrap();

    stream.play().unwrap();
    stream
}
