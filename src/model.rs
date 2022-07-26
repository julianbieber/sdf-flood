use std::time::Instant;

use crevice::std430::{AsStd430, Std430};
use mint::{ColumnMatrix4, Quaternion, Vector2, Vector3};

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

    pub fn square() -> Vec<Vertex> {
        vec![
            Vertex {
                position: mint::Vector3::<f32> {
                    x: -1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: -1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: 1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: -1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 0.0, y: 1.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: 1.0,
                    y: -1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 0.0 },
            },
            Vertex {
                position: mint::Vector3::<f32> {
                    x: 1.0,
                    y: 1.0,
                    z: 0.0,
                },
                pixel: mint::Vector2::<f32> { x: 1.0, y: 1.0 },
            },
        ]
    }
}

#[derive(AsStd430)]
pub struct UniformBuffer {
    time: f32,
    camera: mint::ColumnMatrix4<f32>,
}

pub struct Scene {
    start: Instant,
    time: f32,
    previous: f32,
    camera_pos: mint::Vector3<f32>,
    camera_angle: mint::Vector2<f32>,
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
fn to_matrix(q: &Vector2<f32>, translation: &Vector3<f32>) -> ColumnMatrix4<f32> {
    [
        q.x.cos(), q.x.sin() * q.y.sin(), q.x.sin() * q.y.cos(), translation.x,
        0.0, q.y.cos(), q.y.sin(), translation.y,
        -1.0 * q.x.sin(), q.x.cos() * q.y.sin(), q.x.cos() * q.y.cos(), translation.y,
        0.0, 0.0, 0.0, 1.0,
        
    ].into()
}
