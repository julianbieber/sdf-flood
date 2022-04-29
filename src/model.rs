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

#[derive(AsStd430, Clone)]
pub struct Sphere {
    pub color: mint::Vector3<f32>,
    pub center: mint::Vector3<f32>,
    pub radius: f32,
    pub reflectivity: f32,
}

pub fn create_sphere_buffer(device: &Device, spheres: &Vec<Sphere>) -> Buffer {
    let mut spheres_bytes = vec![];
    let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut spheres_bytes);
    sphere_bytes_writer
        .write_iter(spheres.iter().cloned())
        .unwrap();
    device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
        label: Some("sphere buffer"),
        contents: &spheres_bytes[..],
        usage: wgpu::BufferUsages::STORAGE,
    }) // https://github.com/gfx-rs/wgpu/blob/73f42352f3d80f6a5efd0615b750474ad6ff0338/wgpu/examples/boids/main.rs#L216
}

pub struct Scene {
    lights: Vec<Sphere>,
    lights_chanegd: bool,
    spheres: Vec<Sphere>,
    spheres_changed: bool,
}

impl Scene {
    pub fn empty() -> Scene {
        Scene {
            lights: vec![],
            lights_chanegd: false,
            spheres: vec![],
            spheres_changed: false,
        }
    }

    pub fn new(lights: Vec<Sphere>, spheres: Vec<Sphere>) -> Scene {
        Scene {
            lights,
            spheres,
            lights_chanegd: true,
            spheres_changed: true,
        }
    }

    pub fn get_changed(&mut self) -> (Option<&Vec<Sphere>>, Option<&Vec<Sphere>>) {
        let l = if self.lights_chanegd {
            Some(&self.lights)
        } else {
            None
        };

        let s = if self.spheres_changed {
            Some(&self.spheres)
        } else {
            None
        };
        (l, s)
    }

    pub fn add_light(&mut self) {
        self.lights.push(Sphere {
            color: mint::Vector3 {
                x: 1.0f32,
                y: 0.0f32,
                z: 0.0f32,
            },
            center: mint::Vector3 {
                x: 0.0f32,
                y: 0.0f32,
                z: 0.0f32,
            },
            radius: 1.0,
            reflectivity: 0.0,
        });
        self.lights_chanegd = true;
    }

    pub fn move_last_light(&mut self, x: f32, y: f32, z: f32) {
        self.lights.last_mut().iter_mut().for_each(|l| {
            l.center = mint::Vector3 {
                x: l.center.x + x,
                y: l.center.y + y,
                z: l.center.z + z,
            };
            self.lights_chanegd = true;
        });
    }

    pub fn add_sphere(&mut self) {
        self.spheres.push(Sphere {
            color: mint::Vector3 {
                x: 1.0f32,
                y: 0.0f32,
                z: 0.0f32,
            },
            center: mint::Vector3 {
                x: 0.0f32,
                y: 0.0f32,
                z: 0.0f32,
            },
            radius: 1.0,
            reflectivity: 0.0,
        });
        self.spheres_changed = true;
    }

    pub fn move_last_sphere(&mut self, x: f32, y: f32, z: f32) {
        self.spheres.last_mut().iter_mut().for_each(|l| {
            l.center = mint::Vector3 {
                x: l.center.x + x,
                y: l.center.y + y,
                z: l.center.z + z,
            };
            self.spheres_changed = true;
        });
    }
}

use eframe::egui;
impl eframe::epi::App for Scene {
    fn update(&mut self, ctx: &egui::Context, frame: &eframe::epi::Frame) {
        todo!()
    }

    fn name(&self) -> &str {
        ""
    }
}
