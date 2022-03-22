use encase::ArrayLength;

#[derive(encase::WgslType)]
pub struct Vertex {
    pub position: [f32; 3],
    pub pixel: [f32; 2],
}

impl Vertex {
    pub const ATTRIBS: [wgpu::VertexAttribute; 2] =
        wgpu::vertex_attr_array![0 => Float32x3, 1 => Float32x2];

    pub fn desc<'a>() -> wgpu::VertexBufferLayout<'a> {
        wgpu::VertexBufferLayout {
            array_stride: std::mem::size_of::<Self>() as wgpu::BufferAddress,
            step_mode: wgpu::VertexStepMode::Vertex,
            attributes: &Self::ATTRIBS,
        }
    }

    pub fn square() -> Vec<Vertex> {
        vec![
            Vertex {
                position: [-1.0, 1.0, 0.0],
                pixel: [0.0, 1.0],
            },
            Vertex {
                position: [-1.0, -1.0, 0.0],
                pixel: [0.0, 0.0],
            },
            Vertex {
                position: [1.0, -1.0, 0.0],
                pixel: [1.0, 0.0],
            },
            Vertex {
                position: [-1.0, 1.0, 0.0],
                pixel: [0.0, 1.0],
            },
            Vertex {
                position: [1.0, -1.0, 0.0],
                pixel: [1.0, 0.0],
            },
            Vertex {
                position: [1.0, 1.0, 0.0],
                pixel: [1.0, 1.0],
            },
        ]
    }
}

#[derive(encase::WgslType)]
pub struct Sphere {
    pub radius: f32,
    pub center: nalgebra::Vector3<f32>,
    pub color: nalgebra::Vector3<f32>,
}

#[derive(encase::WgslType)]
pub struct Spheres {
    length: ArrayLength,
    #[size(runtime)]
    spheres: Vec<Sphere>,
}

impl Spheres {
    pub fn new(capacity: usize) -> Spheres {
        Spheres {
            length: ArrayLength,
            spheres: Vec::with_capacity(capacity),
        }
    }

    pub fn add(&mut self, s: Sphere) {
        self.spheres.push(s);
    }
}
