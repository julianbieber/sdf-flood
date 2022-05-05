use std::time::{Duration, Instant};

pub struct FPS {
    buffer: [u64; 32],
    next: usize,
    now: Instant,
}

impl FPS {
    pub fn new() -> FPS {
        FPS {
            buffer: [0; 32],
            next: 0,
            now: Instant::now(),
        }
    }

    pub fn presented(&mut self) {
        let t = self.now.elapsed();
        self.now = Instant::now();
        self.buffer[self.next] = t.as_millis() as u64;
        self.next += 1;
        self.next = self.next % 32;
    }

    pub fn fps(&self) -> f32 {
        let time = self.buffer.iter().clone().sum::<u64>() as f32;
        time / 32000.0
    }
}
