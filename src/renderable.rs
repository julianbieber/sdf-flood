use log::warn;
#[cfg(all(unix, not(target_family = "wasm")))]
use std::time::Instant;
use std::{
    num::NonZeroU64,
    sync::{Arc, Mutex},
};
#[cfg(target_family = "wasm")]
use web_time::Instant;

use mint::Vector2;
use wgpu::{
    util::DeviceExt, BindGroup, BindGroupEntry, BindGroupLayout, BindGroupLayoutDescriptor, Buffer,
    Device, Queue, RenderPass, RenderPipeline, TextureFormat,
};

use crate::{
    model::{create_float_vec2_vec_buffer, create_float_vec_buffer, create_uniform_buffer, Vertex},
    render_pipeline,
};

pub struct MainDisplay {
    pub pipeline: RenderPipeline,
    pub time_start: Instant,
    pub time_offset: f32,
    pub fft: Arc<Mutex<Vec<f32>>>,
    pub eye_positions: Arc<Mutex<Vec<[f32; 2]>>>,
    pub vertices: Buffer,
    pub buffers: Vec<Buffer>,
    pub bind_group: BindGroup,
    pub _layout: Vec<wgpu::BindGroupLayoutEntry>,
}

#[cfg(all(unix, not(target_family = "wasm")))]
fn buffer_layouts() -> Vec<wgpu::BindGroupLayoutEntry> {
    vec![
        wgpu::BindGroupLayoutEntry {
            binding: 0,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Buffer {
                ty: wgpu::BufferBindingType::Uniform {},
                has_dynamic_offset: false,
                min_binding_size: NonZeroU64::new(16),
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
    ]
}
#[cfg(target_family = "wasm")]
fn buffer_layouts() -> Vec<wgpu::BindGroupLayoutEntry> {
    vec![wgpu::BindGroupLayoutEntry {
        binding: 0,
        visibility: wgpu::ShaderStages::FRAGMENT,
        ty: wgpu::BindingType::Buffer {
            ty: wgpu::BufferBindingType::Uniform {},
            has_dynamic_offset: false,
            min_binding_size: NonZeroU64::new(16),
        },
        count: None,
    }]
}

impl MainDisplay {
    pub fn new(
        fft: Arc<Mutex<Vec<f32>>>,
        eye_positions: Arc<Mutex<Vec<[f32; 2]>>>,
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
        let layout_entries = buffer_layouts();
        let bind_group_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: None,
            entries: &layout_entries,
        });

        let fft_lock = fft.lock().unwrap();
        let fft_value = fft_lock[0];
        drop(fft_lock);
        let buffers = create_buffers(device, fft_value);
        let bind_group = create_bind_group(
            device,
            &bind_group_layout,
            &(buffers
                .iter()
                .take(layout_entries.len())
                .collect::<Vec<_>>()),
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
        warn!("pipeline created");
        Self {
            pipeline,
            time_start: Instant::now(),
            fft,
            vertices: vertex_buffer,
            bind_group,
            time_offset,
            eye_positions,
            buffers,
            _layout: layout_entries,
        }
    }

    pub fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_vertex_buffer(0, self.vertices.slice(..));
        render_pass.set_bind_group(0, &self.bind_group, &[]);
        render_pass.draw(0..6, 0..1);
    }

    pub fn update_buffers(&self, queue: &Queue, ui: &Option<UIElements>) {
        let fft_lock = self.fft.lock().unwrap();
        let fft_value = fft_lock[0];
        drop(fft_lock);
        if let Some(time_buffer) = self.buffers.get(0) {
            write_to_buffer(
                &[
                    self.time_start.elapsed().as_secs_f32() + self.time_offset,
                    fft_value,
                    0.0,
                    0.0,
                ],
                time_buffer,
                queue,
            );
        }

        if let Some(ui_buffer) = self.buffers.get(1) {
            if let Some(u) = ui {
                let c = u.elements.iter().map(|u| u.value).collect::<Vec<_>>();
                write_to_buffer(&c, ui_buffer, queue);
            }
        }
        if let Some(eye_buffer) = self.buffers.get(2) {
            let lock = self.eye_positions.lock().unwrap();
            let eye_buffer_content: Vec<f32> = lock.iter().cloned().flatten().collect();
            drop(lock);
            write_to_buffer(&eye_buffer_content, eye_buffer, queue);
        }
    }
}

#[cfg(all(unix, not(target_family = "wasm")))]
fn create_buffers(device: &Device, fft_value: f32) -> Vec<Buffer> {
    let uniform_buffer = create_uniform_buffer("uniform", device, [0.0, fft_value, 0.0, 0.0]);
    let slider_buffer = create_float_vec_buffer("sliders", device, &[0.0; 10]);
    let eye_buffer = create_float_vec2_vec_buffer("eye", device, &[[-1.0, -1.0]]);
    let buffers = vec![uniform_buffer, slider_buffer, eye_buffer];
    buffers
}

#[cfg(target_family = "wasm")]
fn create_buffers(device: &Device, fft_value: f32) -> Vec<Buffer> {
    let uniform_buffer = create_uniform_buffer("uniform", device, [0.0, fft_value, 0.0, 0.0]);
    let buffers = vec![uniform_buffer];
    buffers
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

    #[cfg(target_family = "wasm")]
    pub fn new(device: &Device, format: TextureFormat) -> Option<Self> {
        None
    }

    #[cfg(all(unix, not(target_family = "wasm")))]
    pub fn new(device: &Device, format: TextureFormat) -> Option<Self> {
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
                let slider_buffer = create_uniform_buffer("slider", device, [0.0, 0.0, 0.0, 0.0]);
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
        Some(Self {
            pipeline,
            elements,
            hidden: true,
            selected: 0,
        })
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

fn write_to_buffer(src: &[f32], dst: &Buffer, queue: &Queue) {
    let mut bytes = vec![];
    let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut bytes);
    sphere_bytes_writer.write(src).unwrap();
    queue.write_buffer(dst, 0, &bytes);
}
