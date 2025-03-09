use std::sync::{Arc, Mutex};

#[cfg(all(unix, not(target_family = "wasm")))]
use std::thread;

#[cfg(all(unix, not(target_family = "wasm")))]
use std::time::{Duration, Instant};
#[cfg(target_arch = "wasm32")]
use wasm_thread as thread;
#[cfg(target_family = "wasm")]
use web_time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Stream, StreamConfig};
use rustfft::num_complex::Complex32;
use spectrum_analyzer::scaling::scale_to_zero_to_one;
use spectrum_analyzer::{samples_fft_to_spectrum, FrequencyLimit};

#[allow(dead_code)]
pub fn start() -> (Stream, Arc<Mutex<Vec<f32>>>) {
    let o = Arc::new(Mutex::new(vec![0.0; 2048]));
    let output = o.clone();
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
    (stream, o)
}

use hound;
use rustfft::FftPlanner;

// Define constants
const SAMPLE_RATE: usize = 44100; // Adjust based on your WAV file
const CHUNK_DURATION_MS: usize = 32;
pub const CHUNK_SIZE: usize = SAMPLE_RATE * CHUNK_DURATION_MS / 1000;

#[allow(dead_code)]
pub fn start_voyage(o: Arc<Mutex<Vec<f32>>>, wav_data: Vec<u8>) {
    let output = o.clone();
    let mut reader = hound::WavReader::new(std::io::Cursor::new(wav_data)).unwrap();
    let samples: Vec<i16> = reader.samples::<i16>().map(|s| s.unwrap()).collect();

    let mut planner = FftPlanner::new();
    let fft = planner.plan_fft_forward(CHUNK_SIZE);

    let mut next: usize = 0;
    let mut fft_buffer: Vec<Complex32> = vec![Complex32 { re: 0.0, im: 0.0 }; CHUNK_SIZE];
    let mut out_buffer: Vec<f32> = Vec::with_capacity(CHUNK_SIZE);
    let mut freq_buffer = vec![Vec::new()];

    let normalization: f32 = 2.0f32.powf(16.0);
    for chunk in samples.chunks(CHUNK_SIZE) {
        let start = Instant::now();
        if chunk.len() != CHUNK_SIZE {
            break;
        }
        chunk.iter().zip(fft_buffer.iter_mut()).for_each(|(s, d)| {
            *d = Complex32::new(*s as f32 / normalization, 0.0);
        });
        fft.process(&mut fft_buffer);

        to_flat(&fft_buffer, &mut out_buffer, &mut freq_buffer, 0);

        let mut o = output.lock().unwrap();
        *o = out_buffer.clone();
        drop(o);

        next += 1;
        next = next % freq_buffer.len();
        let elapsed = start.elapsed();
        if elapsed < Duration::from_millis(15) {
            let diff = Duration::from_millis(16) - elapsed;
            thread::sleep(diff);
        }
    }
}

// v contains the fft output for the current frame
// out contains the avg  frequency with  the highest amplitude over the last frames
// amplitude mem contains for the last n frames the amplitudes per freq
fn to_flat(v: &Vec<Complex32>, out: &mut Vec<f32>, amplitude_mem: &mut Vec<Vec<f32>>, next: usize) {
    out.clear();
    let next_amplitude_vec = &mut amplitude_mem[next];
    next_amplitude_vec.clear();
    for v in v {
        next_amplitude_vec.push((v.re * v.re + v.im * v.im).sqrt());
    }
    let mut weight_sum = 0.0;
    for (i, amplitude) in next_amplitude_vec.iter().enumerate() {
        let freq = i as f32 * 44100.0 / next_amplitude_vec.len() as f32;
        let weighted = freq * amplitude;
        out.push(weighted);
        weight_sum += amplitude;
    }
    let sum: f32 = out.iter().sum();
    let sum = sum / weight_sum;
    out.clear();
    out.push(sum);
}
