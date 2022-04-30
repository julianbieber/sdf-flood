use crevice::std430::AsStd430;
use nanorand::{Rng, WyRand};
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

    pub fn birthday() -> Scene {
        let mut s = Scene {
            lights: vec![Sphere {
                color: mint::Vector3 {
                    x: 1.0f32,
                    y: 1.0f32,
                    z: 1.0f32,
                },
                center: mint::Vector3 {
                    x: 0.0f32,
                    y: 0.0f32,
                    z: -10.0f32,
                },
                radius: 0.1,
                reflectivity: 0.0,
            }],
            lights_chanegd: true,
            spheres: vec![],
            spheres_changed: true,
        };

        let mut rng = WyRand::new();
        for i in 0..20 {
            s.add_sphere();
            let offset = rng.generate_range(1_u64..=100_u64);
            s.move_last_sphere(
                0.0,
                -5.0 + (offset as f32) / 100.0 * 3.0 - (2.0 * (i as f32) / 5.0),
                5.0,
            );
            let p = s.spheres.last_mut().unwrap();
            let red = rng.generate_range(0_u64..100_u64);
            p.color.x = red as f32 / 100.0;
            let g = rng.generate_range(0_u64..100_u64);
            p.color.y = g as f32 / 100.0;
            let b = rng.generate_range(0_u64..100_u64);
            p.color.z = b as f32 / 100.0;
        }

        s
    }

    pub fn animate_birthday(&mut self) {
        self.spheres_changed = true;
        let mut rng = WyRand::new();

        for (i, s) in self.spheres.iter_mut().enumerate() {
            s.center.y += 0.1;
            if i == 0 {
            } else if i % 2 == 0 {
                s.center.x -= (s.center.y / 5.0 - 1.0).exp() * 0.2;
            } else {
                s.center.x += (s.center.y / 5.0 - 1.0).exp() * 0.2;
            }
            if s.center.y > 5.0 {
                s.center.x = 0.0;
                let offset = rng.generate_range(1_u64..=100_u64);
                s.center.y = -5.0 + (offset as f32) / 100.0 * 2.0;
            }
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
            reflectivity: 1.0,
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
