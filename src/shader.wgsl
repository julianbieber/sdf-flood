struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

struct SpherePos {
    center: vec3<f32>,
    radius: f32,
}


struct SphereAttribute {
    color: vec3<f32>,
    reflectivity: f32,
};

struct SpherePositions {
    spheres: array<SpherePos>,
};

@vertex
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var o: VertexOutput;
    o.uv = model.uv;
    o.clip_position = vec4<f32>(model.position, 1.0);
    return o;
}


struct FragmentParameters {
    time: f32,
}

@group(0) @binding(0) var<uniform> parameter: FragmentParameters; 


let fov = 75.0;
let pi = 3.14159265359;

fn to_rad(deg: f32) -> f32 {
    return deg * pi / 180.0;
}

fn ray_direction(pixel: vec2<f32>) -> vec3<f32> {
    return  normalize(vec3<f32>(((pixel.x - 0.5) * 1.7777) * 1.6, (pixel.y - 0.5) * 1.6, 1.0));
}

struct SceneSample {
    sampl: f32,
    light: bool,
}

struct RayMarchingResult {
    position: vec3<f32>,
    color: vec3<f32>,
    hit: bool,
    lightHit: bool,  
    reflectivity: f32,
};
fn init_rmr() -> RayMarchingResult {
    return RayMarchingResult(
        vec3<f32>(0.0),
        vec3<f32>(0.0),
        false,
        false,
        0.0
    );
}

fn is_hit(h: SceneSample) -> bool {
    return h.sampl < 0.01;
}

fn hash(p: vec3<f32>) -> f32 {
    let p2  = 50.0*fract( p*0.3183099 + vec3(0.71,0.113,0.419));
    return -1.0+2.0*fract( p2.x*p2.y*p2.z*(p2.x+p2.y+p2.z) );
}

fn noise(x: vec3<f32>) -> f32 {
    let p = floor(x);
    let w = fract(x);
    let u = w * w * w *(w * (w*6.0 - 15.0)+10.0);
    let du = 30.0 * w * w *(w * (w - 2.0) + 1.0);
    
    let a = hash(p + vec3<f32>(0.0, 0.0, 0.0));
    let b = hash(p + vec3<f32>(1.0, 0.0, 0.0));
    let c = hash(p + vec3<f32>(0.0, 1.0, 0.0));
    let d = hash(p + vec3<f32>(1.0, 1.0, 0.0));
    let e = hash(p + vec3<f32>(0.0, 0.0, 1.0));
    let f = hash(p + vec3<f32>(1.0, 0.0, 1.0));
    let g = hash(p + vec3<f32>(0.0, 1.0, 1.0));
    let h = hash(p + vec3<f32>(1.0, 1.0, 1.0));
    let k0 =   a;
    let k1 =   b - a;
    let k2 =   c - a;
    let k3 =   e - a;
    let k4 =   a - b - c + d;
    let k5 =   a - c - e + g;
    let k6 =   a - b - e + f;
    let k7 = - a + b + c - d + e - f - g + h;
    return k0 + k1*u.x + k2*u.y + k3*u.z + k4*u.x*u.y + k5*u.y*u.z + k6*u.z*u.x + k7*u.x*u.y*u.z;
}

fn fbm(p: vec3<f32>, h: f32) -> f32 {
    var t = 0.0;
    for (var i = 0.0; i < 4.0; i = i + 1.0) {
        let f = pow(2.0, i);
        let a = pow(f, -h);
        t = t + a;// * noise(f * p);
    }
    return t;
}

fn material(p: vec3<f32>) -> vec3<f32> {
    return vec3<f32>(0.0, (p.y + 20.0) / 60.00, 0.0);
}

fn calc_reflectivity(p: vec3<f32>) -> f32 {
    return 0.5;
}

fn smoothUnion(d1: f32, d2: f32, k: f32) -> f32 {
    let h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}

fn modu(x: vec3<f32>, y: f32) -> vec3<f32> {
    return x - floor(x/y) * y;
}

fn water(p: vec3<f32>) -> f32 {
    return p.y + 21.0;
}



fn sample_spheres(p_orig: vec3<f32>) -> f32 {
    let p = p_orig;// modu(p_orig + 0.5*20.0, 20.0) - 0.5*20.0;
    var sampl = 1000000.0;
    let water_dist = smoothUnion(water(p_orig), sampl, 3.0);
    sampl = min(sampl, water_dist);
    return sampl;
}

fn sample_lights(p: vec3<f32>) -> f32 {
    var sampl = 10000.0;
    return sampl;
}

fn sample_scene(p: vec3<f32>) -> SceneSample {
    var l = sample_lights(p);
    var s = sample_spheres(p);
    if (l < s) {
        return SceneSample(l, true);
    } else {
        return SceneSample(s, false);
    }
}

fn normal(p: vec3<f32>) -> vec3<f32> {
    let dir = vec2<f32>(0.01, 0.0);

    return normalize(vec3<f32>(
        sample_spheres(p + dir.xyy) - sample_spheres(p - dir.xyy),
        sample_spheres(p + dir.yxy) - sample_spheres(p - dir.yxy),
        sample_spheres(p + dir.yyx) - sample_spheres(p - dir.yyx),
    ));
}

fn follow_ray(start: vec3<f32>, dir: vec3<f32>, iterations: i32) -> RayMarchingResult {
    var p = start;
    for (var i:i32 = 0; i < iterations; i = i + 1) {
        let hit = sample_scene(p);
        if (is_hit(hit)) {
            let base_coror = material(p);
            let reflectivity = calc_reflectivity(p);
            if (hit.light) {
                return RayMarchingResult(p, base_coror, true, true, reflectivity);
            } else {
                return RayMarchingResult(p, base_coror, true, false, reflectivity);
            }
        }
        p = p + (dir * hit.sampl);
    }

    return RayMarchingResult(p, vec3<f32>(0.0, 0.0, 0.0), false, false, 0.0);
}

fn sample_light_rays(start: vec3<f32>) -> RayMarchingResult {
    var result = init_rmr();

        // if (single_ray_result.lightHit) {
            // result.color = result.color + single_ray_result.color;
            // result.position = single_ray_result.position;
        // }
        // result.lightHit = result.lightHit || single_ray_result.lightHit;
    result.color = min(result.color, vec3<f32>(1.0, 1.0, 1.0));
    return result;
}


fn ray_marching(start: vec3<f32>, dir: vec3<f32>, iterations: i32) -> RayMarchingResult {
    var first_hit = follow_ray(start, dir, iterations);
    if (first_hit.hit) {
        var light_hit = sample_light_rays(first_hit.color);
        if (light_hit.lightHit) {
            first_hit.color = first_hit.color * light_hit.color;
        } else {
            first_hit.color = vec3<f32>(0.0, 0.0, 0.0);
        }

        var reflection_strength = 1.0;
        while(reflection_strength > 0.1) {
            let reflection_direction = reflect(dir, normal(first_hit.position));
            var rec = follow_ray(first_hit.position + reflection_direction * 0.1, reflection_direction, iterations);
            if (rec.hit) {
                first_hit.color = first_hit.color * (1.0 - first_hit.reflectivity) + rec.color * first_hit.reflectivity;
                reflection_strength = reflection_strength * first_hit.reflectivity * 0.5;
            } else {
                break;
            }
        }
    }
    return first_hit;
}

@fragment
fn fs_main(v: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(ray_marching(vec3<f32>(0.0, 0.0, 0.0), ray_direction(v.uv), 16).color, 1.0);
}

