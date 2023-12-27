use std::sync::{Arc, Mutex};

use wgpu::{Backends, InstanceFlags, TextureFormat};

use crate::state::{State, WindowSize};

pub async fn render_to_file(srgb: bool, fragment_shader: &str, fft: &Arc<Mutex<Vec<f32>>>) {
    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: Backends::VULKAN,
        dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
        flags: InstanceFlags::debugging(),
        gles_minor_version: wgpu::Gles3MinorVersion::Automatic,
    });
    let (mut state, f, t) = State::new(
        instance,
        None,
        Some(TextureFormat::Rgba8UnormSrgb),
        WindowSize {
            width: 1920,
            height: 1080,
        },
        fragment_shader,
        fft,
        srgb,
        false,
    )
    .await;
    state.render(f, t).unwrap();
}
