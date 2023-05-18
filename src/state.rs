use std::sync::{Arc, Mutex};

use wgpu::Backends;
use winit::{event::VirtualKeyCode, window::Window};

use crate::renderable::{MainDisplay, UIElements};

pub struct State {
    render_state: RenderState,
    main_display: MainDisplay,
    ui: UIElements,
}

struct RenderState {
    surface: wgpu::Surface,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,
}

impl RenderState {
    async fn new(window: &Window, srgb: bool) -> RenderState {
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

        RenderState {
            surface,
            device,
            queue,
            config,
            size,
        }
    }
    fn render(
        &mut self,
        main_display: &MainDisplay,
        ui: &UIElements,
    ) -> Result<(), wgpu::SurfaceError> {
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

            main_display.render(&mut render_pass);
            ui.render(&mut render_pass);
        }

        main_display.update_buffers(&self.queue, ui);
        ui.update_buffers(&self.queue);
        self.queue.submit(std::iter::once(encoder.finish()));
        output.present();
        Ok(())
    }
}

impl State {
    // Creating some of the wgpu types requires async code
    pub async fn new(
        window: &Window,
        fragment_shader_s: &str,
        fft: &Arc<Mutex<Vec<f32>>>,
        srgb: bool,
    ) -> Self {
        let render_state = RenderState::new(window, srgb).await;
        let main_display = MainDisplay::new(
            fft.clone(),
            &render_state.device,
            fragment_shader_s,
            render_state.config.format,
        );
        let ui = UIElements::new(&render_state.device, render_state.config.format);

        Self {
            main_display,
            ui,
            render_state,
        }
    }
    pub fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        self.render_state.render(&self.main_display, &self.ui)
    }

    pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.render_state.size = new_size;
            self.render_state.config.width = self.render_state.size.width;
            self.render_state.config.height = self.render_state.size.height;
            self.render_state
                .surface
                .configure(&self.render_state.device, &self.render_state.config);
        }
    }

    pub fn report_just_pressed(&mut self, key: VirtualKeyCode) {
        match key {
            VirtualKeyCode::M => self.ui.toggle_hidden(),
            VirtualKeyCode::Key1 => self.ui.select(0),
            VirtualKeyCode::Key2 => self.ui.select(1),
            VirtualKeyCode::Key3 => self.ui.select(2),
            VirtualKeyCode::Key4 => self.ui.select(3),
            VirtualKeyCode::Key5 => self.ui.select(4),
            VirtualKeyCode::Key6 => self.ui.select(5),
            VirtualKeyCode::Key7 => self.ui.select(6),
            VirtualKeyCode::Key8 => self.ui.select(7),
            VirtualKeyCode::Key9 => self.ui.select(8),
            VirtualKeyCode::Key0 => self.ui.select(9),
            VirtualKeyCode::Up => self.ui.increment(),
            VirtualKeyCode::Down => self.ui.decrement(),
            _ => (),
        }
    }

    pub fn report_click(&mut self, position: (f32, f32)) {
        self.ui
            .click((position.0 * 2.0 - 1.0, position.1 * 2.0 - 1.0))
    }
}