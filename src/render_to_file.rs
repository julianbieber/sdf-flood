use image::{ImageBuffer, Rgba};
use tokio::sync::oneshot::channel;
use wgpu::{
    BufferAddress, BufferDescriptor, BufferUsages, CommandEncoder, Device, ImageCopyBuffer,
    ImageCopyTexture, ImageDataLayout, Instance, Origin3d, Queue, RequestAdapterOptions, Texture,
    TextureDescriptor, TextureUsages,
};

async fn setup_render_to_file(instance: Instance) {
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
        format: wgpu::TextureFormat::Rgba8UnormSrgb,
        usage: TextureUsages::COPY_SRC | TextureUsages::RENDER_ATTACHMENT,
        view_formats: todo!(),
    };

    let texture = device.create_texture(&tecture_desc);
    let texture_view = texture.create_view(&Default::default());
}

async fn render_to_file(
    devivce: &Device,
    texture: &Texture,
    texture_size: wgpu::Extent3d,
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
