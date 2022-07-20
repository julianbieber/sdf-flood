use std::time::Instant;

use crevice::std430::{AsStd430, Std430};
use mint::{ColumnMatrix4, Quaternion, Vector3};

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
    camera_angle: mint::Quaternion<f32>,
}
impl Scene {
    pub fn new() -> Scene {
        Scene {
            start: Instant::now(),
            time: 0.0,
            previous: 0.0,
            camera_pos: [0.0f32, 0.0f32, 0.0f32].into(),
            camera_angle: [0.0f32, 0.0f32, 0.0f32, 1.0].into(),
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
fn to_matrix(q: &Quaternion<f32>, translation: &Vector3<f32>) -> ColumnMatrix4<f32> {
    [
        2.0f32 * (q.v.x * q.v.x + q.v.y * q.v.y) - 1.0f32, 2.0f32 * (q.v.y * q.v.z - q.v.x*q.s), 2.0f32 * (q.v.y * q.s + q.v.x*q.v.z), translation.x,
        2.0f32 * (q.v.y * q.v.z + q.v.y * q.s), 2.0f32 * (q.v.x * q.v.x - q.v.z * q.v.z) - 1.0f32, 2.0f32 * (q.v.z * q.s - q.v.x * q.v.y), translation.y,
        2.0f32 * (q.v.y * q.s - q.v.x * q.v.z), 2.0f32 * (q.v.z * q.s + q.v.x * q.v.y), 2.0f32 * (q.v.x * q.v.x + q.s * q.s) -1.0f32, translation.z,
        0.0f32, 0.0f32, 0.0f32, 1.0f32,
    ].into()
}
