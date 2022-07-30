use std::time::Instant;

use encase::ShaderType;
use glam::{Mat4, Vec2, Vec3};

#[derive(ShaderType, Clone)]
pub struct Vertex {
    pub position: Vec3,
    pub pixel: Vec2,
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

    pub fn square() -> Vec<Vertex> {
        vec![
            Vertex {
                position: Vec3 {
                    x: -1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: Vec3 {
                    x: -1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 0.0, y: 0.0 },
            },
            Vertex {
                position: Vec3 {
                    x: 1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: Vec3 {
                    x: -1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: Vec3 {
                    x: 1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: Vec3 {
                    x: 1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: Vec2 { x: 1.0, y: 1.0 },
            },
        ]
    }
}

#[derive(ShaderType)]
pub struct UniformBuffer {
    time: f32,
    camera: Mat4,
}
impl UniformBuffer {
    pub fn to_buffer(&self) -> encase::UniformBuffer<Vec<u8>> {
        let mut buffer = encase::UniformBuffer::new(Vec::new());
        buffer.write(&self);
        buffer
    }
}

pub struct Scene {
    start: Instant,
    time: f32,
    previous: f32,
    camera_pos: Vec3,
    camera_angle: Vec2,
}
impl Scene {
    pub fn new() -> Scene {
        Scene {
            start: Instant::now(),
            time: 0.0,
            previous: 0.0,
            camera_pos: [0.0f32, 0.0f32, 0.0f32].into(),
            camera_angle: [0.0f32, 0.0f32].into(),
        }
    }

    pub fn update(&mut self) {
        self.previous = self.time;
        self.time = self.start.elapsed().as_secs_f32();
        let elapsed = self.time - self.previous;
    }

    pub fn buffer(&self) -> UniformBuffer {
        UniformBuffer {
            time: self.time,
            camera: to_matrix(&self.camera_angle, &self.camera_pos),
        }
    }
}

#[rustfmt::skip]
fn to_matrix(q: &Vec2, translation: &Vec3) -> Mat4 {
    Mat4::IDENTITY
}
