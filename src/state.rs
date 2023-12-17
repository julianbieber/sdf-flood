use std::sync::{Arc, Mutex};

use image::{ImageBuffer, Rgba};
use tokio::sync::oneshot::channel;
use wgpu::{
    BufferAddress, BufferDescriptor, BufferUsages, Extent3d, ImageCopyBuffer, ImageCopyTexture,
    ImageDataLayout, Instance, Origin3d, Surface, Texture, TextureFormat, TextureUsages,
    TextureView,
};
use winit::event::VirtualKeyCode;

use crate::renderable::{MainDisplay, UIElements};

pub struct State {
    render_state: RenderState,
    main_display: MainDisplay,
    ui: UIElements,
}

enum SurfaceTypes {
    Window(wgpu::Surface),
    File(),
}

struct RenderState {
    surface: SurfaceTypes,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: Option<wgpu::SurfaceConfiguration>,
    format: TextureFormat, // size: winit::dpi::PhysicalSize<u32>,
}

impl RenderState {
    async fn new(
        instance: Instance,
        surface: Option<Surface>,
        width: u32,
        height: u32,
        srgb: bool,
        format: Option<TextureFormat>,
    ) -> (RenderState, Option<TextureView>, Option<Texture>) {
        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::HighPerformance,
                force_fallback_adapter: false,
                compatible_surface: surface.as_ref(),
            })
            .await
            .unwrap();
        match surface {
            Some(surface) => {
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
                            label: Some("device"),
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
                    width,
                    height,
                    present_mode: wgpu::PresentMode::Immediate,
                    alpha_mode: surface_caps.alpha_modes[0],
                    view_formats: vec![],
                };
                surface.configure(&device, &config);
                (
                    RenderState {
                        surface: SurfaceTypes::Window(surface),
                        device,
                        queue,
                        config: Some(config),
                        format: surface_format,
                    },
                    None,
                    None,
                )
            }
            None => {
                let (device, queue) = adapter
                    .request_device(&Default::default(), None)
                    .await
                    .unwrap();
                let tecture_desc = wgpu::TextureDescriptor {
                    label: Some("output texture"),
                    size: wgpu::Extent3d {
                        width: 1920,
                        height: 1080,
                        depth_or_array_layers: 1,
                    },
                    mip_level_count: 1,
                    sample_count: 1,
                    dimension: wgpu::TextureDimension::D2,
                    format: TextureFormat::Rgba8UnormSrgb,
                    usage: TextureUsages::COPY_SRC | TextureUsages::RENDER_ATTACHMENT,
                    view_formats: &[TextureFormat::Rgba8UnormSrgb],
                };

                let texture = device.create_texture(&tecture_desc);
                //  Some((
                //     &texture,
                //     wgpu::Extent3d {
                //         width: 1920,
                //         height: 1080,
                //         depth_or_array_layers: 1,
                //     },
                // ))
                let texture_view = texture.create_view(&Default::default());
                (
                    RenderState {
                        surface: SurfaceTypes::File(),
                        device,
                        queue,
                        config: None,
                        format: format.unwrap(),
                    },
                    Some(texture_view),
                    Some(texture),
                )
            }
        }
    }
    fn render(
        &mut self,
        main_display: &MainDisplay,
        ui: &UIElements,
        file_render_view: Option<TextureView>,
        file_render_texture: Option<Texture>,
    ) -> Result<(), wgpu::SurfaceError> {
        let (output, view) = match &self.surface {
            SurfaceTypes::Window(s) => {
                let o = s.get_current_texture()?;
                let v = o
                    .texture
                    .create_view(&wgpu::TextureViewDescriptor::default());
                (Some(o), v)
            }
            SurfaceTypes::File() => (None, file_render_view.unwrap()),
        };
        // .as_ref()
        // .map(|s| s.get_current_texture().unwrap());
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
                timestamp_writes: None,
                occlusion_query_set: None,
            });

            main_display.render(&mut render_pass);
            ui.render(&mut render_pass);
        }

        main_display.update_buffers(&self.queue, ui);
        ui.update_buffers(&self.queue);
        let ob = match &self.surface {
            SurfaceTypes::Window(_) => None,
            SurfaceTypes::File() => {
                let u32_size = std::mem::size_of::<u32>() as u32;
                let output_buffer_size = (u32_size * 1920 * 1080) as BufferAddress;
                let output_buffer_desc = BufferDescriptor {
                    label: Some("abc"),
                    size: output_buffer_size,
                    usage: BufferUsages::COPY_DST | BufferUsages::MAP_READ,
                    mapped_at_creation: false,
                };
                let output_buffer = self.device.create_buffer(&output_buffer_desc);
                encoder.copy_texture_to_buffer(
                    ImageCopyTexture {
                        texture: &file_render_texture.unwrap(),
                        mip_level: 0,
                        origin: Origin3d::ZERO,
                        aspect: wgpu::TextureAspect::All,
                    },
                    ImageCopyBuffer {
                        buffer: &output_buffer,
                        layout: ImageDataLayout {
                            offset: 0,
                            bytes_per_row: Some(u32_size * 1920),
                            rows_per_image: Some(1080),
                        },
                    },
                    wgpu::Extent3d {
                        width: 1920,
                        height: 1080,
                        depth_or_array_layers: 1,
                    },
                );
                Some(output_buffer)
            } // None => {}
        };
        self.queue.submit(std::iter::once(encoder.finish()));
        match &self.surface {
            SurfaceTypes::Window(s) => output.unwrap().present(),
            SurfaceTypes::File() => {
                let buffer_slice = ob.as_ref().unwrap().slice(..);
                let (tx, rx) = channel();
                buffer_slice.map_async(wgpu::MapMode::Read, move |result| {
                    tx.send(result).unwrap();
                });
                self.device.poll(wgpu::MaintainBase::Wait);
                pollster::block_on(async { rx.await.unwrap().unwrap() });
                let data = buffer_slice.get_mapped_range();
                let buffer = ImageBuffer::<Rgba<u8>, _>::from_raw(1920, 1080, data).unwrap();
                buffer.save("screen.png").unwrap();
            }
        }
        // output.map(|o| o.present());
        Ok(())
    }
}

impl State {
    // Creating some of the wgpu types requires async code
    pub async fn new(
        instance: Instance,
        surface: Option<Surface>,
        format: Option<TextureFormat>,
        width: u32,
        height: u32,
        fragment_shader_s: &str,
        fft: &Arc<Mutex<Vec<f32>>>,
        srgb: bool,
    ) -> (Self, Option<TextureView>, Option<Texture>) {
        let (render_state, file_info, f) =
            RenderState::new(instance, surface, width, height, srgb, format).await;
        let main_display = MainDisplay::new(
            fft.clone(),
            &render_state.device,
            fragment_shader_s,
            render_state.format,
        );
        let ui = UIElements::new(&render_state.device, render_state.format);

        (
            Self {
                main_display,
                ui,
                render_state,
            },
            file_info,
            f,
        )
    }
    pub fn render(
        &mut self,
        file_render_view: Option<TextureView>,
        file_render_texture: Option<Texture>,
    ) -> Result<(), wgpu::SurfaceError> {
        self.render_state.render(
            &self.main_display,
            &self.ui,
            file_render_view,
            file_render_texture,
        )
    }

    pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            if let SurfaceTypes::Window(s) = &self.render_state.surface {
                s.configure(
                    &self.render_state.device,
                    &self.render_state.config.as_ref().unwrap(),
                );
            }
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
