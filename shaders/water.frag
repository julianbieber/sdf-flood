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
#define FOV 60.0

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
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

float water_layer(vec3 p) {
    return dot(p, vec3(0.0, 1.0, 0.0)) + (sliders.v[0] - 0.5) * 10.0;
}
float sky(vec3 p) {
    return p.y - 7.0;
}

vec3 l1_p() {
    return vec3(0.0, (sliders.v[1] - 0.5) * 10.0, (sliders.v[3] - 0.5) * 30.0);
}

SceneSample scene(vec3 p) {
    SceneSample l = SceneSample(sphere(p, l1_p(), sliders.v[2] * 2.0), 1);
    SceneSample w = SceneSample(water_layer(p), 2);
    SceneSample s = SceneSample(sky(p), 3);

    return combine(l, w);
}

float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
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
        return vec4(1.0, 1.0, 1.0, 1.0);
    }
    if (index == 2) {
        return vec4(0.0, 0.0, 1.0, 1.0);
    } 
    if (index == 3) {
        return vec4(0.8, 0.1, 1.0, 1.0);
    }
    return vec4(0);
}

bool is_light(int index) {
    return index == 1;
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 10);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index);
    return color;
    vec3 light_positions[1] = vec3[](
        l1_p()
    );
    bool at_least_one_light = is_light(end.s.index);
    for (int light_index = 0; light_index < light_positions.length(); ++light_index) {
        vec3 p = light_positions[light_index];
        vec3 light_d = normalize(p - end.current_position);
        RayEnd light_traced = follow_ray(end.current_position + light_d * 0.001, light_d, 10);
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
    vec3 pixel_position = vec3(((uv.x - 0.5) / 1.200 )* fov, ((uv.y - 0.5) / 1.920) * fov + 1.0, 0.0);
    vec3 eye_position = vec3(0.0, 1.0, -1.0);
    vec3 ray_direction = normalize(pixel_position - eye_position); 

    out_color = render(eye_position, ray_direction);
} 