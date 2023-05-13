mod audio;
mod model;
mod render_pipeline;
mod util;

use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Instant,
};

use clap::Parser;
use model::{create_fft_buffer, create_time_buffer, Vertex};
use util::Fps;
use wgpu::{
    util::DeviceExt, Backends, BindGroup, BindGroupLayout, BindGroupLayoutDescriptor, Buffer,
    Device, Queue, RenderPass, RenderPipeline, TextureFormat,
};
use winit::{
    event::*,
    event_loop::{ControlFlow, EventLoop},
    window::{Fullscreen, WindowBuilder},
};

#[derive(Parser, Debug)]
struct Opt {
    #[arg(long, default_value = "shaders/shader.frag")]
    shader_path: PathBuf,
    #[arg(long)]
    srgb: bool,
    #[arg(long)]
    fps: bool,
}

fn main() {
    env_logger::init();
    let o = Arc::new(Mutex::new(vec![0.0; 1920]));
    audio::start(o.clone());

    let opt = dbg!(Opt::parse());

    let fragment_shader = std::fs::read_to_string(opt.shader_path).unwrap();

    // let mut scene = Scene::new(light_spheres, spheres);
    let event_loop = EventLoop::new();
    let mut video_modes: Vec<_> = event_loop
        .available_monitors()
        .next()
        .unwrap()
        .video_modes()
        .collect();
    video_modes.sort_by_key(|a| a.size().height * a.size().width);
    let window = WindowBuilder::new()
        .with_fullscreen(Some(Fullscreen::Exclusive(
            video_modes.last().unwrap().clone(),
        )))
        .build(&event_loop)
        .unwrap();
    let mut state = pollster::block_on(State::new(&window, &fragment_shader, &o, opt.srgb));
    let mut fps = Fps::new();
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
            if opt.fps {
                fps.presented();
                dbg!(fps.fps());
            }
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
    main_display: MainDisplay,
}

impl State {
    // Creating some of the wgpu types requires async code
    async fn new(
        window: &Window,
        fragment_shader_s: &str,
        fft: &Arc<Mutex<Vec<f32>>>,
        srgb: bool,
    ) -> Self {
        let size = window.inner_size();
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            backends: Backends::VULKAN,
            dx12_shader_compiler: wgpu::Dx12Compiler::Fxc,
        });
        let surface = unsafe { instance.create_surface(window).unwrap() };
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: Some(&surface),
            })
            .await
            .unwrap();
        let surface_caps = surface.get_capabilities(&adapter);
        // Shader code in this tutorial assumes an sRGB surface texture. Using a different
        // one will result all the colors coming out darker. If you want to support non
        // sRGB surfaces, you'll need to account for that when drawing to the frame.
        let surface_format = surface_caps
            .formats
            .iter()
            .find(|f| if srgb { f.is_srgb() } else { !f.is_srgb() })
            .copied()
            .unwrap_or(surface_caps.formats[0]);
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
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: wgpu::PresentMode::Immediate,
            alpha_mode: surface_caps.alpha_modes[0],
            view_formats: vec![],
        };
        surface.configure(&device, &config);
        let main_display = MainDisplay::new(fft.clone(), &device, fragment_shader_s, config.format);

        Self {
            surface,
            device,
            queue,
            config,
            size,
            main_display,
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

    fn input(&mut self, _event: &WindowEvent) -> bool {
        false
    }

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
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color::BLUE),
                        store: true,
                    },
                })],
                depth_stencil_attachment: None,
            });

            self.main_display.render(&mut render_pass);
        }

        self.main_display.update_buffers(&self.queue);
        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }
}

struct MainDisplay {
    pipeline: RenderPipeline,
    time_start: Instant,
    fft: Arc<Mutex<Vec<f32>>>,
    time_buffer: Buffer,
    fft_buffer: Buffer,
    vertices: Buffer,
    bind_group: BindGroup,
}

impl MainDisplay {
    fn new(
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
        let time_buffer = create_time_buffer(device, 0.0);
        let fft_lock = fft.lock().unwrap();
        let fft_buffer = create_fft_buffer(device, fft_lock.as_slice());
        drop(fft_lock);
        let bind_group = create_bind_group(device, &bind_group_layout, &time_buffer, &fft_buffer);
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

    fn render<'a, 'b: 'a>(&'b self, render_pass: &mut RenderPass<'a>) {
        render_pass.set_pipeline(&self.pipeline);
        render_pass.set_vertex_buffer(0, self.vertices.slice(..));
        render_pass.set_bind_group(0, &self.bind_group, &[]);
        render_pass.draw(0..6, 0..1);
    }

    fn update_buffers(&self, queue: &Queue) {
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

fn create_bind_group(
    device: &Device,
    layout: &BindGroupLayout,
    time_buffer: &Buffer,
    fft_buffer: &Buffer,
) -> BindGroup {
    let bind_group = device.create_bind_group(&wgpu::BindGroupDescriptor {
        label: None,
        layout,
        entries: &[
            wgpu::BindGroupEntry {
                binding: 0,
                resource: time_buffer.as_entire_binding(),
            },
            wgpu::BindGroupEntry {
                binding: 1,
                resource: fft_buffer.as_entire_binding(),
            },
        ],
    });
    bind_group
}
