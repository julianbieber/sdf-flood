use cpal::{
    traits::{DeviceTrait, HostTrait, StreamTrait},
    Stream,
};
use hound::WavReader;
use std::sync::Arc;

#[allow(dead_code)]
pub fn play_audio() -> Stream {
    beep()
}

fn beep() -> Stream {
    let host = cpal::default_host();
    let device = host
        .default_output_device()
        .expect("failed to find a default output device");
    let config = device.default_output_config().unwrap();

    match config.sample_format() {
        cpal::SampleFormat::F32 => run::<f32>(&device, &config.into()),
        cpal::SampleFormat::I16 => run::<i16>(&device, &config.into()),
        cpal::SampleFormat::U16 => run::<u16>(&device, &config.into()),
        _ => panic!("unsupported sample format"),
    }
}
fn run<T>(device: &cpal::Device, config: &cpal::StreamConfig) -> Stream
where
    T: cpal::Sample + cpal::SizedSample + cpal::FromSample<i16>,
{
    let _sample_rate = config.sample_rate.0 as f32;
    let channels = config.channels as usize;

    // Produce a sinusoid of maximum amplitude.
    let wav_bytes = include_bytes!("BabyElephantWalk60.wav");
    let mut wav_reader = WavReader::new(&wav_bytes[..]).unwrap();
    let wav_data: Vec<i16> = wav_reader.samples::<i16>().map(|v| v.unwrap()).collect();
    let wav_data = Arc::new(wav_data);
    let mut c = 0;
    let mut next_value = move || {
        c += 1;
        wav_data[c % wav_data.len()]
    };

    let err_fn = |err| {
        let _ = dbg!(format!("an error occurred on stream: {}", err));
    };

    let stream = device
        .build_output_stream(
            config,
            move |data: &mut [T], _| write_data(data, channels, &mut next_value),
            err_fn,
            None,
        )
        .unwrap();
    stream.play().unwrap();
    stream
}

fn write_data<T>(output: &mut [T], channels: usize, next_sample: &mut dyn FnMut() -> i16)
where
    T: cpal::Sample + cpal::FromSample<i16>,
{
    for frame in output.chunks_mut(channels) {
        let sample = next_sample();
        let value = T::from_sample::<i16>(sample);
        for sample in frame.iter_mut() {
            *sample = value;
        }
    }
}
