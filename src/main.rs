mod model;
mod render_pipeline;
use model::{Sphere, Vertex};
use wgpu::{util::DeviceExt, BindGroupLayoutDescriptor};
use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
    window::{Fullscreen, WindowBuilder},
};

fn main() {
    env_logger::init();
    let event_loop = EventLoop::new();
    let mut video_modes: Vec<_> = event_loop
        .available_monitors()
        .next()
        .unwrap()
        .video_modes()
        .collect();
    video_modes.sort_by_key(|a| a.size().height * a.size().width);
    dbg!(video_modes.last());
    let window = WindowBuilder::new()
        .with_fullscreen(Some(Fullscreen::Exclusive(
            video_modes.last().unwrap().clone(),
        )))
        .build(&event_loop)
        .unwrap();

    let vertices = Vertex::square();
    let spheres = vec![
        model::Sphere {
            radius: 1.5,
            center: mint::Vector3 {
                x: 0.0f32,
                y: -2.5f32,
                z: 5.0f32,
            },
            color: mint::Vector3 {
                x: 1.0f32,
                y: 1.0f32,
                z: 1.0f32,
            },
        },
        model::Sphere {
            radius: 1.0,
            center: mint::Vector3 {
                x: 0.0f32,
                y: 0.0f32,
                z: 5.0f32,
            },
            color: mint::Vector3 {
                x: 1.0f32,
                y: 1.0f32,
                z: 1.0f32,
            },
        },
        model::Sphere {
            radius: 0.5,
            center: mint::Vector3 {
                x: 0.0f32,
                y: 1.5f32,
                z: 5.0f32,
            },
            color: mint::Vector3 {
                x: 1.0f32,
                y: 1.0f32,
                z: 1.0f32,
            },
        },
        model::Sphere {
            color: mint::Vector3 {
                x: 0.0,
                y: 0.0,
                z: 0.0,
            },
            center: mint::Vector3 {
                x: -0.1,
                y: 1.6,
                z: 4.5f32,
            },
            radius: 0.1,
        },
    ];

    let mut state = pollster::block_on(State::new(&window, &vertices, &spheres));
    event_loop.run(move |event, _, control_flow| match event {
        Event::WindowEvent {
            ref event,
            window_id,
        } if window_id == window.id() && !state.input(event) => match event {
            WindowEvent::CloseRequested
            | WindowEvent::KeyboardInput {
                input:
                    KeyboardInput {
                        state: ElementState::Pressed,
                        virtual_keycode: Some(VirtualKeyCode::Escape),
                        ..
                    },
                ..
            } => *control_flow = ControlFlow::Exit,
            WindowEvent::Resized(size) => state.resize(*size),
            WindowEvent::ScaleFactorChanged { new_inner_size, .. } => {
                state.resize(**new_inner_size)
            }
            _ => {}
        },
        Event::RedrawRequested(window_id) if window_id == window.id() => {
            state.update();
            match state.render() {
                Ok(_) => {}
                Err(wgpu::SurfaceError::Lost) => state.resize(state.size),
                Err(wgpu::SurfaceError::OutOfMemory) => *control_flow = ControlFlow::Exit,
                Err(e) => {
                    eprintln!("{e:?}");
                }
            }
        }
        Event::MainEventsCleared => window.request_redraw(),
        _ => {}
    });
}

use winit::window::Window;

struct State {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
    render_pipeline: wgpu::RenderPipeline,
    vertex_buffer: wgpu::Buffer,
    bind_group: wgpu::BindGroup,
    vertices: Vec<u8>,
    num_vertices: usize,
    spheres: Vec<u8>,
}

impl State {
    // Creating some of the wgpu types requires async code
    async fn new(window: &Window, vertices: &Vec<Vertex>, spheres: &Vec<Sphere>) -> Self {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(wgpu::Backends::VULKAN);
        let surface = unsafe { instance.create_surface(window) };
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .unwrap();

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: None,
                    features: wgpu::Features::empty(),
                    limits: wgpu::Limits::default(),
                },
                None,
            )
            .await
            .unwrap();

        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface.get_preferred_format(&adapter).unwrap(),
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Fifo,
        };
        surface.configure(&device, &config);

        let shader = device.create_shader_module(&wgpu::ShaderModuleDescriptor {
            label: Some("shader"),
            source: wgpu::ShaderSource::Wgsl(include_str!("shader.wgsl").into()),
        });

        let bind_group_layout = device.create_bind_group_layout(&BindGroupLayoutDescriptor {
            label: None,
            entries: &[wgpu::BindGroupLayoutEntry {
                binding: 0,
                visibility: wgpu::ShaderStages::FRAGMENT,
                ty: wgpu::BindingType::Buffer {
                    ty: wgpu::BufferBindingType::Storage { read_only: true },
                    has_dynamic_offset: false,
                    min_binding_size: None,
                },
                count: None,
            }],
        });

        let mut spheres_bytes = vec![];
        let mut sphere_bytes_writer = crevice::std430::Writer::new(&mut spheres_bytes);
        sphere_bytes_writer
            .write_iter(spheres.iter().cloned())
            .unwrap();
        dbg!(spheres_bytes.len());
        let buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("sphere buffer"),
            contents: &spheres_bytes[..],
            usage: wgpu::BufferUsages::STORAGE,
        }); // https://github.com/gfx-rs/wgpu/blob/73f42352f3d80f6a5efd0615b750474ad6ff0338/wgpu/examples/boids/main.rs#L216

        let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: None,
            layout: &bind_group_layout,
            entries: &[wgpu::BindGroupEntry {
                binding: 0,
                resource: buffer.as_entire_binding(),
            }],
        });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("render pipeline layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });
        let render_pipeline =
            device.create_render_pipeline(&render_pipeline::render_pipeline_descriptor(
                &shader,
                &render_pipeline_layout,
                &[wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                }],
                &[Vertex::desc()],
            ));
        let mut vertex_bytes = vec![];
        let mut vertex_bytes_writer = crevice::std430::Writer::new(&mut vertex_bytes);
        vertex_bytes_writer
            .write_iter(vertices.iter().cloned())
            .unwrap();
        dbg!(vertex_bytes.len());
        let vertex_buffer = device.create_buffer_init(&wgpu::util::BufferInitDescriptor {
            label: Some("vertex buffer"),
            contents: &vertex_bytes[..],
            usage: wgpu::BufferUsages::VERTEX,
        });

        Self {
            surface,
            device,
            queue,
            config,
            size,
            render_pipeline,
            vertex_buffer,
            bind_group,
            vertices: vertex_bytes,
            spheres: spheres_bytes,
            num_vertices: vertices.len(),
        }
    }

    fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.size = new_size;
            self.config.width = self.size.width;
            self.config.height = self.size.height;
            self.surface.configure(&self.device, &self.config);
        }
    }

    fn input(&mut self, event: &WindowEvent) -> bool {
        false
    }

    fn update(&mut self) {}

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());
        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });
        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLUE),
                        store: true,
                    },
                }],
                depth_stencil_attachment: None,
            });

            render_pass.set_pipeline(&self.render_pipeline);
            render_pass.set_vertex_buffer(0, self.vertex_buffer.slice(..));
            render_pass.set_bind_group(0, &self.bind_group, &[]);
            render_pass.draw(0..self.num_vertices as u32, 0..1);
        }
        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }
}
