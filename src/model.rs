use crevice::std430::AsStd430;
use wgpu::{util::DeviceExt, Buffer, Device};

#[derive(AsStd430, Clone)]
pub struct Vertex {
    pub position: mint::Vector3<f32>,
    pub pixel: mint::Vector2<f32>,
}

impl Vertex {
    pub const ATTRIBS: [wgpu::VertexAttribute; 2] =
        wgpu::vertex_attr_array![0 => Float32x4, 1 => Float32x2];

    pub fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        dbg!(std::mem::size_of::<Self>());
        wgpu::VertexBufferLayout {
            array_stride: 32 as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBS,
        }
    }

    pub fn rect(center: mint::Vector2<f32>, width: f32, height: f32, z: f32) -> Vec<Vertex> {
        vec![
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x - width / 2.0,
                    y: center.y + height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x - width / 2.0,
                    y: center.y - height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x + width / 2.0,
                    y: center.y - height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x - width / 2.0,
                    y: center.y + height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x + width / 2.0,
                    y: center.y - height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: center.x + width / 2.0,
                    y: center.y + height / 2.0,
                    z,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 1.0 },
            },
        ]
    }
}

pub fn create_float_buffer(name: &str, device: &Device, time: f32) -> Buffer {
    let mut bytes = vec![];
    let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
    sphere_bytes_writer.write(&time).unwrap();
    sphere_bytes_writer.write(&0.0).unwrap();
    sphere_bytes_writer.write(&0.0).unwrap();
    sphere_bytes_writer.write(&0.0).unwrap();
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(name),
        contents: &bytes[..],
        usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
    }) // https://github.com/gfx-rs/wgpu/blob/73f42352f3d80f6a5efd0615b750474ad6ff0338/wgpu/examples/boids/main.rs#L216
}
pub fn create_float_vec_buffer(name: &str, device: &Device, fft: &[f32]) -> Buffer {
    let mut bytes = vec![];
    let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
    sphere_bytes_writer.write(fft).unwrap();
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(name),
        contents: &bytes[..],
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
    }) // https://github.com/gfx-rs/wgpu/blob/73f42352f3d80f6a5efd0615b750474ad6ff0338/wgpu/examples/boids/main.rs#L216
}
pub fn create_float_vec2_vec_buffer(name: &str, device: &Device, content: &[[f32; 2]]) -> Buffer {
    let mint_content = content.iter().map(|s| mint::Point2::from_slice(s));
    let mut bytes = vec![];
    let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
    sphere_bytes_writer.write_iter(mint_content).unwrap();
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some(name),
        contents: &bytes[..],
        usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
    }) // https://github.com/gfx-rs/wgpu/blob/73f42352f3d80f6a5efd0615b750474ad6ff0338/wgpu/examples/boids/main.rs#L216
}
