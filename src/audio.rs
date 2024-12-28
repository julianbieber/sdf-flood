use std::sync::{Arc, Mutex};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use spectrum_analyzer::scaling::scale_to_zero_to_one;
use spectrum_analyzer::{samples_fft_to_spectrum, FrequencyLimit};

#[allow(dead_code)]
pub fn start(output: Arc<Mutex<Vec<f32>>>) -> Stream {
    let length = output.lock().unwrap().len();
    let host = cpal::default_host();
    let input_device = host
        .default_input_device()
        .expect("No input device available");

    let config = StreamConfig {
        channels: 1,                          // Number of audio channels (e.g., mono or stereo)
        sample_rate: cpal::SampleRate(44100), // Sample rate in Hz
        buffer_size: cpal::BufferSize::Fixed(length as u32 * 4 * 2), // Buffer size
    };

    let mut buffer = vec![0.0f32; length * 2];
    let stream = input_device
        .build_input_stream(
            &config,
            move |data: &[i16], _: &_| {
                for (c, v) in buffer.iter_mut().zip(data.iter()) {
                    *c = *v as f32;
                }
                // let hann_window = hann_window(&buffer);
                let spectrum_hann_window = samples_fft_to_spectrum(
                    // (windowed) samples
                    &buffer,
                    // sampling rate
                    44100,
                    // optional frequency limit: e.g. only interested in frequencies 50 <= f <= 150?
                    FrequencyLimit::All,
                    // optional scale
                    Some(&scale_to_zero_to_one),
                )
                .unwrap();
                let mut o = output.lock().unwrap();
                o.iter_mut()
                    .zip(spectrum_hann_window.data().iter())
                    .for_each(|(o, (_, c))| {
                        *o = c.val();
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
