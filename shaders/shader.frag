#version 450 
layout (location = 0) out vec4 out_color;
  
layout (location = 0) in vec2 uv;   
layout (binding  = 0) uniform UniformParameters {
    float time;
} u;
layout (binding  = 1) readonly buffer fftBuffer{
    float v[];
} fft;
layout (binding  = 2) readonly buffer SliderParameters{
    float v[];
} sliders;


#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 100

struct SceneSample {
    float closest_distance;
    int index;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
};

float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

SceneSample combine(SceneSample a, SceneSample b) {
    SceneSample r = a;
    if (b.closest_distance < a.closest_distance) {
        r.closest_distance = b.closest_distance;
        r.index = b.index;
    }
    return r;
}

vec3 l1_p() {
    return vec3(sin(u.time * 0.1) * 4.0, sin(u.time * 0.1) * 10.0, sin(u.time * 0.1) * 12.0);
}
vec3 l2_p() {
    return vec3(cos(u.time) * 4.0, 0.0, -9.0);
}

SceneSample scene(vec3 p) {
    SceneSample s = SceneSample(sphere(p, vec3(0.0, sin(u.time), 12.0), 2.0), 1);
    SceneSample l1 = SceneSample(sphere(p, l1_p(), 0.1), 2);
    SceneSample l2 = SceneSample(sphere(p, l2_p(), 0.1), 3);
    SceneSample r = combine(s, l1);
    r = combine(r, l2);

    return r;
}

float fov_factor() {
    return tan(FOV / 2 * PI / 180);
}

RayEnd follow_ray(vec3 start, vec3 direction, int steps) {
    for (int i = 0; i < steps; ++i) {
        SceneSample s = scene(start);
        if (s.closest_distance < 0.0001) {
            return RayEnd(s, start);
        }
        start += direction * s.closest_distance;
    }

    return RayEnd(SceneSample(1000.0, -1), start);
}

vec4 resolve_color(int index) {
    if (index == 1) {
        return vec4(1.0, 0.1, 0.2, 1.0);
    }
    if (index == 2) {
        return vec4(0.1, 1.0, 0.1, 1.0);
    } 
    if (index == 3) {
        return vec4(0.1, 0.1, 1.0, 1.0);
    }
    return vec4(0);
}

bool is_light(int index) {
    return index == 2 || index == 3;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 10);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index);
    return color;
    vec3 light_positions[2] = vec3[](
        l1_p(),
        l2_p()
    );
    bool at_least_one_light = is_light(end.s.index);
    for (int light_index = 0; light_index < light_positions.length(); ++light_index) {
        vec3 p = light_positions[light_index];
        vec3 light_d = normalize(p - end.current_position);
        RayEnd light_traced = follow_ray(end.current_position + light_d * 0.1, light_d, 10);
        if (is_light(light_traced.s.index)) {
            color *= resolve_color(light_traced.s.index);
            at_least_one_light = true;
        }
    }
    if (!at_least_one_light) {
        return vec4(0.0);
    }
    return color;
}

void main(){
    float fov = fov_factor();
    vec3 pixel_position = vec3((uv.x - 0.5) / 1.200 * fov, (uv.y - 0.5) / 1.920 * fov, 0.0);
    vec3 eye_position = vec3(0.0, 0.0, -1.0);
    vec3 ray_direction = normalize(pixel_position - eye_position); 

    out_color = render(eye_position, ray_direction);
} 