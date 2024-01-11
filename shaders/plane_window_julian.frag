#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 2) readonly buffer SliderParameters {
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

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float sdPlane(vec3 p, vec3 n, float h) {
    return dot(p, n) + h;
}
float rand(float n) {
    return fract(sin(n) * 43758.5453123);
}
float rand2(vec2 n) {
    return fract(sin(dot(n, vec2(12.9898, 4.1414))) * 43758.5453);
}

float noise(vec2 n) {
    const vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(n), f = smoothstep(vec2(0.0), vec2(1.0), fract(n));
    return mix(mix(rand2(b), rand2(b + d.yx), f.x), mix(rand2(b + d.xy), rand2(b + d.yy), f.x), f.y);
}

float surface(vec3 p) {
    float plane = sdPlane(p, vec3(0.0, 1.0, 0.0), 0.0);
    plane -= (noise(p.xz)) * 0.1;

    return plane;
}

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

SceneSample scene(vec3 p) {
    return SceneSample(surface(p), 1);
}

float scene_f(vec3 p) {
    return scene(p).closest_distance;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene_f(p + h.xyy) - scene_f(p - h.xyy),
            scene_f(p + h.yxy) - scene_f(p - h.yxy),
            scene_f(p + h.yyx) - scene_f(p - h.yyx)));
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += s.closest_distance;
    }

    return RayEnd(SceneSample(traveled, -1), start + direction * traveled);
}

vec4 resolve_color(int index, vec3 p, vec3 dir) {
    if (index == 1) {
        vec3 n = normal(p);
        float light = dot(n, vec3(0.0, 10.0, 0.0));
        vec3 white = vec3(1.0);
        vec3 blue = vec3(0.0, 0.0, 1.0);
        vec3 inter = (p.y * white + (1.0 - p.y) * blue) * light;
        return vec4(inter, 1.0);
    }
    return vec4(0);
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index, end.current_position, ray);
    return color;
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(0.0, 2.0, -10.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
