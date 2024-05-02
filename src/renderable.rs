use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use mint::Vector2;
use wgpu::{
    util::DeviceExt, BindGroup, BindGroupEntry, BindGroupLayout, BindGroupLayoutDescriptor, Buffer,
    Device, Queue, RenderPass, RenderPipeline, TextureFormat,
};

use crate::{
    model::{create_float_buffer, create_float_vec_buffer, Vertex},
    render_pipeline,
};

pub struct MainDisplay {
    pub pipeline: RenderPipeline,
    pub time_start: Instant,
    pub time_offset: f32,
    pub fft: Arc<Mutex<Vec<f32>>>,
    pub time_buffer: Buffer,
    pub fft_buffer: Buffer,
    pub slider_buffer: Buffer,
    pub vertices: Buffer,
    pub bind_group: BindGroup,
}
impl MainDisplay {
    pub fn new(
        fft: Arc<Mutex<Vec<f32>>>,
        device: &Device,
        fragment_shader: &str,
        format: TextureFormat,
        pi: bool,
        time_offset: f32,
    ) -> MainDisplay {
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("shader.vert").into(),
                stage: wgpu::naga::ShaderStage::Vertex,
                defines: wgpu::naga::FastHashMap::default(),
            },
        });
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("fragment_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: fragment_shader.into(),
                stage: wgpu::naga::ShaderStage::Fragment,
                defines: wgpu::naga::FastHashMap::default(),
            },
        });
        let bind_group_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: None,
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform {},
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let time_buffer = create_float_buffer("time", device, 0.0);
        let fft_lock = fft.lock().unwrap();
        let fft_buffer = create_float_vec_buffer("fft", device, fft_lock.as_slice());
        drop(fft_lock);
        let slider_buffer = create_float_vec_buffer("sliders", device, &[0.0; 10]);
        let bind_group = create_bind_group(
            device,
            &bind_group_layout,
            &[&time_buffer, &fft_buffer, &slider_buffer],
        );
        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("render pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });
        let vertices = if pi {
            Vertex::rect(Vector2 { x: -0.4, y: -0.45 }, 1.3, 1.1, 0.0)
        } else {
            Vertex::rect(Vector2 { x: 0.0, y: 0.0 }, 2.0, 2.0, 0.0)
        };
        let mut vertex_bytes = vec![];
        let mut vertex_bytes_writer = crevice::std430::Writer::new(&mut vertex_bytes);
        vertex_bytes_writer
            .write_iter(vertices.iter().cloned())
            .unwrap();
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vertex buffer"),
            contents: &vertex_bytes[..],
            usage: wgpu::BufferUsages::VERTEX,
        });
        let pipeline = device.create_render_pipeline(&render_pipeline::render_pipeline_descriptor(
            &vertex_shader,
            &fragment_shader,
            &render_pipeline_layout,
            &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::REPLACE),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            &[Vertex::desc()],
        ));
        Self {
            pipeline,
            time_start: Instant::now(),
            fft,
            time_buffer,
            fft_buffer,
            vertices: vertex_buffer,
            bind_group,
            slider_buffer,
            time_offset,
        }
    }

    pub fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_vertex_buffer(0, self.vertices.slice(..));
        render_pass.set_bind_group(0, &self.bind_group, &[]);
        render_pass.draw(0..6, 0..1);
    }

    pub fn update_buffers(&self, queue: &Queue, ui: &UIElements) {
        let mut bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
        sphere_bytes_writer
            .write(&(self.time_start.elapsed().as_secs_f32() + self.time_offset))
            .unwrap();
        queue.write_buffer(&self.time_buffer, 0, &bytes);
        let mut bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
        let fft_lock = self.fft.lock().unwrap();
        sphere_bytes_writer.write(fft_lock.as_slice()).unwrap();
        drop(fft_lock);
        queue.write_buffer(&self.fft_buffer, 0, &bytes);

        let mut bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
        sphere_bytes_writer
            .write(
                ui.elements
                    .iter()
                    .map(|u| u.value)
                    .collect::<Vec<_>>()
                    .as_slice(),
            )
            .unwrap();
        queue.write_buffer(&self.slider_buffer, 0, &bytes);
    }
}

pub struct UIElements {
    pub pipeline: RenderPipeline,
    pub elements: Vec<UIElement>,
    pub hidden: bool,
    pub selected: usize,
}

impl UIElements {
    /// (0,0) is the center of the screen
    /// (-1,-1) is the bottom left corner
    /// (-1, 1) is the top left corner
    pub fn click(&mut self, position: (f32, f32)) {
        if !self.hidden {
            for slider in self.elements.iter_mut() {
                slider.try_set(position);
            }
        }
    }
    pub fn toggle_hidden(&mut self) {
        self.hidden = !self.hidden;
    }
    pub fn select(&mut self, s: usize) {
        if s < self.elements.len() {
            self.selected = s;
        }
    }

    pub fn increment(&mut self) {
        if !self.hidden {
            self.elements[self.selected].increment();
        }
    }
    pub fn decrement(&mut self) {
        if !self.hidden {
            self.elements[self.selected].decrement();
        }
    }
    pub fn new(device: &Device, format: TextureFormat) -> Self {
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("ui.vert").into(),
                stage: wgpu::naga::ShaderStage::Vertex,
                defines: wgpu::naga::FastHashMap::default(),
            },
        });
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("fragment_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("ui.frag").into(),
                stage: wgpu::naga::ShaderStage::Fragment,
                defines: wgpu::naga::FastHashMap::default(),
            },
        });
        let bind_group_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Uniform {},
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });
        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("render pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });
        let pipeline = device.create_render_pipeline(&render_pipeline::render_pipeline_descriptor(
            &vertex_shader,
            &fragment_shader,
            &render_pipeline_layout,
            &[Some(wgpu::ColorTargetState {
                format,
                blend: Some(wgpu::BlendState::REPLACE),
                write_mask: wgpu::ColorWrites::ALL,
            })],
            &[Vertex::desc()],
        ));

        let width = 0.5;
        let height = 0.05;
        let elements: Vec<_> = (0..10)
            .map(|i| {
                let slider_buffer = create_float_buffer("slider", device, 0.0);
                let bind_group = create_bind_group(device, &bind_group_layout, &[&slider_buffer]);
                let vertices = Vertex::rect(
                    Vector2 {
                        x: -0.7,
                        y: 0.8 - i as f32 / 10.0,
                    },
                    width,
                    height,
                    0.001,
                );
                let mut vertex_bytes = vec![];
                let mut vertex_bytes_writer = crevice::std430::Writer::new(&mut vertex_bytes);
                vertex_bytes_writer
                    .write_iter(vertices.iter().cloned())
                    .unwrap();
                let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
                    label: Some("vertex buffer"),
                    contents: &vertex_bytes[..],
                    usage: wgpu::BufferUsages::VERTEX,
                });
                UIElement {
                    vertices: vertex_buffer,
                    bind_group,
                    slider_buffer,
                    value: 0.5,
                    dimensions: (width, height),
                    center: (-0.7, 0.8 - i as f32 / 10.0),
                }
            })
            .collect();
        Self {
            pipeline,
            elements,
            hidden: true,
            selected: 0,
        }
    }

    pub fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
        if self.hidden {
            return;
        }
        render_pass.set_pipeline(&self.pipeline);
        for element in self.elements.iter() {
            render_pass.set_vertex_buffer(0, element.vertices.slice(..));
            render_pass.set_bind_group(0, &element.bind_group, &[]);
            render_pass.draw(0..6, 0..1);
        }
    }

    pub fn update_buffers(&self, queue: &Queue) {
        for element in self.elements.iter() {
            let mut bytes = vec![];
            let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
            sphere_bytes_writer.write(&element.value).unwrap();
            queue.write_buffer(&element.slider_buffer, 0, &bytes);
        }
    }
}
pub struct UIElement {
    pub vertices: Buffer,
    pub bind_group: BindGroup,
    pub slider_buffer: Buffer,
    pub value: f32,
    pub dimensions: (f32, f32),
    pub center: (f32, f32),
}

impl UIElement {
    fn increment(&mut self) {
        self.value += 0.01;
        if self.value > 1.0 {
            self.value = 1.0;
        }
    }
    fn decrement(&mut self) {
        self.value -= 0.01;
        if self.value < 0.0 {
            self.value = 0.0;
        }
    }

    fn try_set(&mut self, global_position: (f32, f32)) {
        if global_position.0 >= self.center.0 - self.dimensions.0 / 2.0
            && global_position.0 <= self.center.0 + self.dimensions.0 / 2.0
            && global_position.1 >= self.center.1 - self.dimensions.1 / 2.0
            && global_position.1 <= self.center.1 + self.dimensions.1 / 2.0
        {
            let start = self.center.0 - self.dimensions.0 / 2.0;
            let length = self.dimensions.0;
            self.value = (global_position.0 - start) / length
        }
    }
}

fn create_bind_group(device: &Device, layout: &BindGroupLayout, buffers: &[&Buffer]) -> BindGroup {
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &buffers
            .iter()
            .enumerate()
            .map(|(i, b)| BindGroupEntry {
                binding: i as u32,
                resource: b.as_entire_binding(),
            })
            .collect::<Vec<_>>(),
    });
    bind_group
}
