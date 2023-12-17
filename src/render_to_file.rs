use std::sync::{Arc, Mutex};

use wgpu::{
    Backends, BufferAddress, BufferDescriptor, BufferUsages, CommandEncoder, Device, Extent3d,
    ImageCopyBuffer, ImageCopyTexture, ImageDataLayout, Instance, Origin3d, Queue,
    RequestAdapterOptions, Texture, TextureDescriptor, TextureFormat, TextureUsages,
};

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
