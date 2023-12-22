use std::sync::{Arc, Mutex};

use wgpu::{Backends, Device, Extent3d, InstanceFlags, Texture, TextureFormat};

use crate::state::State;

pub struct FileRenderSurface {
    device: Device,
    texture: Texture,
    texture_size: Extent3d,
}

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
        1920,
        1080,
        fragment_shader,
        fft,
        srgb,
    )
    .await;
    state.render(f, t).unwrap();
}
