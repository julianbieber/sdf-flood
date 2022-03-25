struct VertexInput {
    [[location(0)]] position: vec3<f32>;
    [[location(1)]] uv: vec2<f32>;
};

struct VertexOutput {
    [[builtin(position)]] clip_position: vec4<f32>;
    [[location(0)]] uv: vec2<f32>;
};



struct Sphere {
    color: vec4<f32>;
    center: vec3<f32>;
    radius: f32;
};

struct Spheres {
    spheres: [[stride(32)]] array<Sphere>;
};

[[group(0), binding(0)]] var<storage,read> spheres: Spheres;
[[stage(vertex)]]
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var out: VertexOutput;
    out.uv = model.uv;
    out.clip_position = vec4<f32>(model.position, 1.0);
    return out;
}
let fov = 75.0;
let pi = 3.14159265359;

fn to_rad(deg: f32) -> f32 {
    return deg * pi / 180.0;
}

fn ray_direction(pixel: vec2<f32>) -> vec3<f32> {
    return  normalize(vec3<f32>((pixel.x - 0.5) * 1.7777, pixel.y - 0.5, 1.0));
}

struct RayHit {
    distance: f32;
    color: vec4<f32>;
};

fn sample_scene(point: vec3<f32>)  -> RayHit {
    var hit = RayHit(100000000.0, vec4<f32>(0.0, 0.0, 0.0, 0.0));
    for (var i: u32 = 0u; i < arrayLength(&spheres.spheres); i = i + 1u) {
        let sphere = spheres.spheres[i];
        let d = length(point - sphere.center) - sphere.radius;
        if (d < hit.distance) {
            hit.distance = d;
            hit.color = sphere.color;
        }
    }
    return hit; //length(point - vec3<f32>(0.0,0.0,2.0)) - 1.0;
}

[[stage(fragment)]]
fn fs_main(in: VertexOutput) -> [[location(0)]] vec4<f32> {

    var eye = vec3<f32>(0.0, 0.0, 0.0);
    var ray_dir = ray_direction(in.uv);
    var ray_pos = eye;
    
    for (var i:i32 = 0; i < 64; i = i+ 1) {
        let hit = sample_scene(ray_pos);
        ray_pos = ray_pos + (ray_dir * hit.distance);
        if (hit.distance <= 0.001) {
            return hit.color; // vec4<f32>(0.0, 0.0, 0.0, 1.0);
        }
    }

    return vec4<f32>(in.uv.x, in.uv.y, 0.0, 1.0);
}





 