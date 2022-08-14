use std::time::Instant;

use encase::ShaderType;
use glam::{Affine3A, EulerRot, Mat4, Quat, Vec2, Vec3};
use winit::event::{DeviceEvent, KeyboardInput};

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
    w_pressed: bool,
    a_pressed: bool,
    s_pressed: bool,
    d_pressed: bool,
    mouse_delta: Vec2,
    camera_angle: Vec2,
    current_affine: Affine3A,
}
impl Scene {
    pub fn new() -> Scene {
        Scene {
            start: Instant::now(),
            time: 0.0,
            previous: 0.0,
            camera_angle: [0.0f32, 0.0f32].into(),
            current_affine: Affine3A::IDENTITY,
            w_pressed: false,
            a_pressed: false,
            s_pressed: false,
            d_pressed: false,
            mouse_delta: Vec2::ZERO,
        }
    }

    pub fn register_device_event(&mut self, event: &DeviceEvent) {
        match event {
            DeviceEvent::MouseMotion { delta } => {
                self.mouse_delta += Vec2::new(delta.0 as f32, delta.1 as f32)
            }
            _ => {}
        }
    }
    pub fn register_key_event(&mut self, key: &KeyboardInput) {
        match key {
            KeyboardInput {
                scancode,
                state,
                virtual_keycode,
                modifiers,
            } => {}
        }
    }

    pub fn update(&mut self) {
        self.previous = self.time;
        self.time = self.start.elapsed().as_secs_f32();
        let elapsed = self.time - self.previous;

        self.camera_angle += self.mouse_delta;
        self.camera_angle.y = self
            .camera_angle
            .y
            .max(std::f32::consts::PI)
            .min(std::f32::consts::PI * -1.0);
        self.current_affine = Affine3A::from_rotation_translation(
            Quat::from_euler(EulerRot::XYZ, self.camera_angle.y, self.camera_angle.x, 0.0),
            self.current_affine.translation.into(),
        );

        self.mouse_delta = Vec2::ZERO;
    }

    pub fn buffer(&self) -> UniformBuffer {
        UniformBuffer {
            time: self.time,
            camera: Mat4::from(self.current_affine),
        }
    }
}
