use std::{
    sync::{Arc, Mutex},
    time::Instant,
};

use wgpu::{
    util::DeviceExt, BindGroup, BindGroupLayoutDescriptor, Buffer, Device, Queue, RenderPass,
    RenderPipeline, TextureFormat,
};

use crate::{
    create_bind_group,
    model::{create_float_buffer, create_float_vec_buffer, Vertex},
    render_pipeline,
};

pub struct MainDisplay {
    pub pipeline: RenderPipeline,
    pub time_start: Instant,
    pub fft: Arc<Mutex<Vec<f32>>>,
    pub time_buffer: Buffer,
    pub fft_buffer: Buffer,
    pub vertices: Buffer,
    pub bind_group: BindGroup,
}
impl MainDisplay {
    pub fn new(
        fft: Arc<Mutex<Vec<f32>>>,
        device: &Device,
        fragment_shader: &str,
        format: TextureFormat,
    ) -> MainDisplay {
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("shader.vert").into(),
                stage: naga::ShaderStage::Vertex,
                defines: naga::FastHashMap::default(),
            },
        });
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("fragment_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: fragment_shader.into(),
                stage: naga::ShaderStage::Fragment,
                defines: naga::FastHashMap::default(),
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
            ],
        });
        let time_buffer = create_float_buffer("time", device, 0.0);
        let fft_lock = fft.lock().unwrap();
        let fft_buffer = create_float_vec_buffer("fft", device, fft_lock.as_slice());
        drop(fft_lock);
        let bind_group =
            create_bind_group(device, &bind_group_layout, &[&time_buffer, &fft_buffer]);
        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("render pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });
        let vertices = Vertex::square();
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
        }
    }

    pub fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_vertex_buffer(0, self.vertices.slice(..));
        render_pass.set_bind_group(0, &self.bind_group, &[]);
        render_pass.draw(0..6, 0..1);
    }

    pub fn update_buffers(&self, queue: &Queue) {
        let mut bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
        sphere_bytes_writer
            .write(&self.time_start.elapsed().as_secs_f32())
            .unwrap();
        queue.write_buffer(&self.time_buffer, 0, &bytes);
        let mut bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
        let fft_lock = self.fft.lock().unwrap();
        sphere_bytes_writer.write(fft_lock.as_slice()).unwrap();
        drop(fft_lock);
        queue.write_buffer(&self.fft_buffer, 0, &bytes);
    }
}

pub struct UIElements {
    pub pipeline: RenderPipeline,
    pub elements: Vec<UIElement>,
}

impl UIElements {
    pub fn new(device: &Device, format: TextureFormat) -> Self {
        let vertex_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("vertex_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("ui.vert").into(),
                stage: naga::ShaderStage::Vertex,
                defines: naga::FastHashMap::default(),
            },
        });
        let fragment_shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("fragment_shader"),
            source: wgpu::ShaderSource::Glsl {
                shader: include_str!("ui.frag").into(),
                stage: naga::ShaderStage::Fragment,
                defines: naga::FastHashMap::default(),
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
        let time_buffer = create_float_buffer("slider", device, 0.0);
        let bind_group = create_bind_group(device, &bind_group_layout, &[&time_buffer]);
        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("render pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });
        let vertices = Vertex::square();
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
            elements: todo!(),
        }
    }

    pub fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
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
            sphere_bytes_writer.write(&0.0_f32).unwrap();
            queue.write_buffer(&element.slider_buffer, 0, &bytes);
        }
    }
}
pub struct UIElement {
    pub vertices: Buffer,
    pub bind_group: BindGroup,
    pub slider_buffer: Buffer,
}
