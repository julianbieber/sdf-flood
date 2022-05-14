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

struct SphereAttributes {
    spheres: array<SphereAttribute>,
}

@group(0) @binding(0) var<storage,read> spheres: SpherePositions;
@group(0) @binding(1) var<storage,read> sphere_attributes: SphereAttributes;
@group(0) @binding(2) var<storage,read> light_spheres: SpherePositions;
@group(0) @binding(3) var<storage,read> light_attributes: SphereAttributes;

@vertex
fn vs_main(
    model: VertexInput,
) -> VertexOutput {
    var o: VertexOutput;
    o.uv = model.uv;
    o.clip_position = vec4<f32>(model.position, 1.0);
    return o;
}

let fov = 75.0;
let pi = 3.14159265359;

fn to_rad(deg: f32) -> f32 {
    return deg * pi / 180.0;
}

fn ray_direction(pixel: vec2<f32>) -> vec3<f32> {
    return  normalize(vec3<f32>(((pixel.x - 0.5) * 1.7777) * 1.6, (pixel.y - 0.5) * 1.6, 1.0));
}

struct Sample {
    distance: f32,
    closest_index: u32,
};

struct SceneSample {
    sampl: Sample,
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

fn init_hit() -> Sample {
    return Sample(100000.0, 0u);
}

fn is_hit(h: SceneSample) -> bool {
    return h.sampl.distance < 0.01;
}

fn sample_spheres(p: vec3<f32>) -> Sample {
    var sampl = init_hit();
    let l = arrayLength(&spheres.spheres);
    for (var i: u32 = 0u; i < l; i = i + 1u) {
        let sphere = spheres.spheres[i];
        let d = length(p - sphere.center) - sphere.radius;
        if (d < sampl.distance) {
            sampl.distance = d;
            sampl.closest_index = i;
        }
    }
    return sampl;
}

fn sample_lights(p: vec3<f32>) -> Sample {
    var sampl = init_hit();
    let l = arrayLength(&light_spheres.spheres);
    for (var i: u32 = 0u; i < l; i = i + 1u) {
        let sphere = light_spheres.spheres[i];
        let d = length(p - sphere.center) - sphere.radius;
        if (d < sampl.distance) {
            sampl.distance = d;
            sampl.closest_index = i;
        }
    }
    return sampl;
}

fn sample_scene(p: vec3<f32>) -> SceneSample {
    var l = sample_lights(p);
    var s = sample_spheres(p);
    if (l.distance < s.distance) {
        return SceneSample(l, true);
    } else {
        return SceneSample(s, false);
    }
}

fn normal(p: vec3<f32>) -> vec3<f32> {
    let dir = vec2<f32>(0.01, 0.0);

    return normalize(vec3<f32>(
        sample_scene(p + dir.xyy).sampl.distance - sample_scene(p - dir.xyy).sampl.distance,
        sample_scene(p + dir.yxy).sampl.distance - sample_scene(p - dir.yxy).sampl.distance,
        sample_scene(p + dir.yyx).sampl.distance - sample_scene(p - dir.yyx).sampl.distance,
    ));
}

fn follow_ray(start: vec3<f32>, dir: vec3<f32>, iterations: i32) -> RayMarchingResult {
    var p = start;
    for (var i:i32 = 0; i < iterations; i = i + 1) {
        let hit = sample_scene(p);
        if (is_hit(hit)) {
            if (hit.light) {
                let att = light_attributes.spheres[hit.sampl.closest_index];
                return RayMarchingResult(p, att.color, true, true, att.reflectivity);
            } else {
                let att = sphere_attributes.spheres[hit.sampl.closest_index];
                return RayMarchingResult(p, att.color, true, false, att.reflectivity);
            }
        }
        p = p + (dir * hit.sampl.distance);
    }

    return RayMarchingResult(p, vec3<f32>(0.0, 0.0, 0.0), false, false, 0.0);
}

fn sample_light_rays(start: vec3<f32>) -> RayMarchingResult {
    var result = init_rmr();
    let l = arrayLength(&light_spheres.spheres);
    for (var i: u32 = 0u; i < l; i = i + 1u) {
        var l = light_spheres.spheres[i];

        var direction = normalize(l.center - start);

        var single_ray_result = follow_ray(start + direction * 0.01, direction, 8);

        if (single_ray_result.lightHit) {
            result.color = result.color + single_ray_result.color;
            result.position = single_ray_result.position;
        }
        result.lightHit = result.lightHit || single_ray_result.lightHit;
    }
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

