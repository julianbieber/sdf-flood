use std::sync::{Arc, Mutex};

use image::{ImageBuffer, Rgba};
use tokio::sync::oneshot::channel;
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
    let adapter = instance
        .request_adapter(&RequestAdapterOptions {
            power_preference: wgpu::PowerPreference::HighPerformance,
            force_fallback_adapter: false,
            compatible_surface: None,
        })
        .await
        .unwrap();
    let (device, queue) = adapter
        .request_device(&Default::default(), None)
        .await
        .unwrap();

    let tecture_desc = wgpu::TextureDescriptor {
        label: None,
        size: wgpu::Extent3d {
            width: 1920,
            height: 1080,
            depth_or_array_layers: 1,
        },
        mip_level_count: 1,
        sample_count: 1,
        dimension: wgpu::TextureDimension::D2,
        format: TextureFormat::Rgba8UnormSrgb,
        usage: TextureUsages::COPY_SRC | TextureUsages::RENDER_ATTACHMENT,
        view_formats: &[TextureFormat::Rgba8UnormSrgb],
    };

    let texture = device.create_texture(&tecture_desc);
    let texture_view = texture.create_view(&Default::default());

    let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
        backends: Backends::VULKAN,
        dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
    });
    let mut state = State::new(instance, None, 1920, 1080, fragment_shader, fft, srgb).await;
    state
        .render(
            Some((
                &texture,
                wgpu::Extent3d {
                    width: 1920,
                    height: 1080,
                    depth_or_array_layers: 1,
                },
            )),
            Some(texture_view),
        )
        .unwrap();
}

async fn foo(
    devivce: &Device,
    texture: &Texture,
    texture_size: Extent3d,
    mut encoder: CommandEncoder,
    queue: &mut Queue,
) {
    let u32_size = std::mem::size_of::<u32>() as u32;
    let output_buffer_size = (u32_size * 1920 * 1080) as BufferAddress;
    let output_buffer_desc = BufferDescriptor {
        label: None,
        size: output_buffer_size,
        usage: BufferUsages::COPY_DST | BufferUsages::MAP_READ,
        mapped_at_creation: false,
    };
    let output_buffer = devivce.create_buffer(&output_buffer_desc);
    encoder.copy_texture_to_buffer(
        ImageCopyTexture {
            texture: &texture,
            mip_level: 0,
            origin: Origin3d::ZERO,
            aspect: wgpu::TextureAspect::All,
        },
        ImageCopyBuffer {
            buffer: &output_buffer,
            layout: ImageDataLayout {
                offset: 0,
                bytes_per_row: Some(u32_size * 1920),
                rows_per_image: Some(1080),
            },
        },
        texture_size,
    );
    queue.submit(Some(encoder.finish()));
    {
        let buffer_slice = output_buffer.slice(..);
        let (tx, rx) = channel();
        buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
            tx.send(result).unwrap();
        });
        devivce.poll(wgpu::MaintainBase::Wait);
        rx.await.unwrap().unwrap();
        let data = buffer_slice.get_mapped_range();
        let buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(1920, 1080, data).unwrap();
        buffer.save("screen.png").unwrap();
    }
    output_buffer.unmap();
}
