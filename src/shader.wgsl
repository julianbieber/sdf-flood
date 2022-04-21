struct VertexInput {
    @location(0) position: vec3<f32>,
    @location(1) uv: vec2<f32>,
};

struct VertexOutput {
    @builtin(position) clip_position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};



struct Sphere {
    color: vec3<f32>,
    center: vec3<f32>,
    radius: f32,
    reflectivity: f32,
};

struct Spheres {
    spheres: array<Sphere>,
};

@group(0) @binding(0) var<storage,read> spheres: Spheres;
@group(0) @binding(1) var<storage,read> light_spheres: Spheres;

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

struct RayHit {
    distance: f32,
    color: vec3<f32>,
    light: bool,
    reflectiviy: f32,
};

struct RayMarchingResult {
    color: vec3<f32>,
    hit: bool,
    lightHit: bool,  
};

fn init_hit() -> RayHit {
    return RayHit(100000.0, vec3<f32>(0.0,0.0,0.0), false, 0.0);
}

fn is_hit(h: RayHit) -> bool {
    return h.distance < 0.001;
}

fn sample_spheres(p: vec3<f32>) -> RayHit {
    var hit = init_hit();
    for (var i: u32 = 0u; i < arrayLength(&spheres.spheres); i = i + 1u) {
        let sphere = spheres.spheres[i];
        let d = length(p - sphere.center) - sphere.radius;
        if (d < hit.distance) {
            hit.distance = d;
            hit.color = sphere.color;
            hit.reflectiviy = sphere.reflectivity;
        }
    }
    return hit;
}

fn sample_lights(p: vec3<f32>) -> RayHit {
    var hit = init_hit();
    hit.light = true;
    for (var i: u32 = 0u; i < arrayLength(&light_spheres.spheres); i = i + 1u) {
        let sphere = light_spheres.spheres[i];
        let d = length(p - sphere.center) - sphere.radius;
        if (d < hit.distance) {
            hit.distance = d;
            hit.color = sphere.color;
            hit.reflectiviy = sphere.reflectivity;
        }
    }
    return hit;
}

fn sample_scene(p: vec3<f32>) -> RayHit {
    var l = sample_lights(p);
    var s = sample_spheres(p);
    if (l.distance < s.distance) {
        return l;
    } else {
        return s;
    }
}

fn normal(p: vec3<f32>) -> vec3<f32> {
    let dir = vec2<f32>(0.01, 0.0);
    
    return normalize(vec3<f32>(
         sample_scene(p + dir.xyy).distance - sample_scene(p - dir.xyy).distance,   
         sample_scene(p + dir.yxy).distance - sample_scene(p - dir.yxy).distance,   
         sample_scene(p + dir.yyx).distance - sample_scene(p - dir.yyx).distance,   
    ));
}

fn follow_ray(start: vec3<f32>, dir: vec3<f32>, iterations: i32) -> RayMarchingResult {
    
    var pos = start;
    for (var i:i32 = 0; i < iterations; i = i + 1) {
        let hit = sample_scene(pos);
        if (is_hit(hit)) {
            return RayMarchingResult(hit.color, true, hit.light); 
        }
        pos = pos + (dir * hit.distance);
    }
    
    return RayMarchingResult(vec3<f32>(0.0, 0.0, 0.0), false, false);
    
}

fn sample_light_rays(start: vec3<f32>) -> RayMarchingResult {
    var result = RayMarchingResult(vec3<f32>(0.0, 0.0, 0.0), false, false);
    for (var i: u32 = 0u; i < arrayLength(&light_spheres.spheres); i = i + 1u) {
        var l = light_spheres.spheres[i];

        var direction = normalize(l.center - start);

        var single_ray_result =  follow_ray(start + direction * vec3<f32>(0.01, 0.01, 0.01), direction, 63);
        
        if (single_ray_result.lightHit) {
            result.color = result.color + single_ray_result.color;
        }
        result.lightHit = result.lightHit || single_ray_result.lightHit;
    }
    result.color = min(result.color, vec3<f32>(1.0, 1.0, 1.0));
    return result;
}


fn ray_marching(start: vec3<f32>, dir: vec3<f32>, iterations: i32, strength: f32) -> RayMarchingResult {
    var pos = start;
    for (var i:i32 = 0; i < iterations; i = i + 1) {
        let hit = sample_scene(pos);
        if (is_hit(hit)) {
            var light_hit = sample_light_rays(pos);
            var h = RayMarchingResult(vec3<f32>(0.0, 0.0, 0.0), true, false);
            if (light_hit.lightHit) {
                h = RayMarchingResult((hit.color * light_hit.color) * strength, true, true); 
            }
            
            if (strength > 0.1) {
                let ref_dir = reflect(dir, normal(pos));
                
                var rec = follow_ray(pos + ref_dir * 0.01, ref_dir, iterations);
                if (rec.hit) {
                    h.color = h.color * (1.0 - hit.reflectiviy) + rec.color * hit.reflectiviy;  
                } 
            }
            return h;
        }
        pos = pos + (dir * hit.distance);
    }
    
    return RayMarchingResult(vec3<f32>(0.0, 0.0, 0.0), false, false);
    
}

@fragment
fn fs_main(v: VertexOutput) -> @location(0) vec4<f32> {
    return vec4<f32>(ray_marching(vec3<f32>(0.0,0.0,0.0), ray_direction(v.uv), 64, 1.0).color, 1.0);
}

