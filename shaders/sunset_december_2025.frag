#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
} u;
layout(binding = 1) readonly buffer fftBuffer {
    float v[];
} fft;
layout(binding = 3) readonly buffer eyeBuffer {
    float v[];
} eyes;
layout(binding = 2) readonly buffer SliderParameters {
    float v[];
} sliders;

// https://iquilezles.org/articles/palettes/
// https://dev.thi.ng/gradients/
// https://graphtoy.com/
// https://oklch.com/#0.5147,0.0789,79.41,100

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0
#define T u.time * 0.2


float hash(vec3 x) {
    return abs(fract(dot (sin(x*89.1231234), sin(x*213.2131))));
}

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}

mat3x3 rot(float x, float y, float z) {
    return mat3x3(1.0, 0.0, 0.0, 0.0, cos(x), -sin(x), 0.0, sin(x), cos(x)) *
        mat3x3(cos(y), 0.0, -sin(y), 0.0, 1.0, 0.0, -sin(y), 0.0, cos(y)) *
        mat3x3(cos(z), -sin(z), 0.0, sin(z), cos(z), 0.0, 0.0, 0.0, 1.0);
}

float dotnoise(vec3 x, float r) {
    float n = 0.0;
    for (int i = 0; i < 7; ++i) {
        n += dot(cos(x), cos(x.yzx));
        n *= 1.0 / 5.0;
        x *= rot(0.54*r,0.234* r, 0.2*r);
        // x = x.yzx;
    }
    return n;
}

float billow_dot(vec3 x, float r) {
    float lun = 2.0;
    float amplitude_m = 1.5;
    float acc = 0.0;
    float freq = 1.0;

    for (int i = 0; i < 5; ++i) {
        acc += abs(dotnoise(x, r) * amplitude_m);
        freq *= lun;
        amplitude_m /= lun;
    }
    return acc;
}

float ground(vec3 p) {
    return p.y + 1.0 - abs(billow_dot(vec3(p.xz * 0.2, T), 1.0)) * 1.2;
}

vec3 ground_normal(vec3 p) {
    const float eps = 0.0001;
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(ground(p + h.xyy) - ground(p - h.xyy),
            ground(p + h.yxy) - ground(p - h.yxy),
            ground(p + h.yyx) - ground(p - h.yyx)));
}


vec3 cos_scaled(vec3 p) {
    return 2.0 * (cos(p) + 1.0);
}
vec3 ground_color(vec3 p) {
    vec3 n = ground_normal(p);
    float i = dot(n, normalize(vec3(T, T, T)));

    return (vec3(0.5, 0.2, 0.2) + vec3(0.1, 0.1, 0.1) * cos_scaled(vec3(0.2, 0.5, 0.5) * (p.y - 2.0) + vec3(0.0)) * (1.0 - tanh(T))) * i;
}

float water_level(vec3 p) {
    return p.y - 1.2;
}

vec3 sky_color(vec3 p) {
    vec3 sunset_red = vec3(0.7, 0.0, 0.0) + vec3(0.3, 0.2, 0.6) * cos_scaled(vec3(0.2, 0.5, 0.5) * (p.y - 2.0) + vec3(0.0)) * (1.0 - tanh(T));

    vec3 sky = vec3(0.0, 0.0, 0.4) + vec3(0.3, 0.2, 0.6) * cos_scaled(vec3(0.1, 0.5, 0.5) * (billow_dot(vec3(p.xz * .2, T), p.y*0.2) - 2.0) + 1.0 + vec3(2.0));

    return mix(sunset_red, sky, p.y * 0.2);
}

void main() {
    vec2 uv2 = uv;
    uv2 -= 0.5;
    uv2 *= 2.0;
    uv2.y *= 1.2 / 1.92;

    vec3 ro = vec3(0.0, 2.0, -10.0);
    vec3 rd = normalize(vec3(uv2, 1.0));

    float t = 0.0;

    float ground_factor = 0.0;
    for (int i = 0; i < 300; ++i) {
        vec3 p = ro + rd * t;

        float gd = ground(p);
        if (gd < 0.003) {
            if (water_level(p) < 0.001) {
                rd = refract(rd, vec3(0.0, 1.0, 0.0), hash(p*0.001)*0.1);
                rd = reflect(rd, vec3(0.0, 1.0, 0.0));
                ro = p + rd * 0.3;
                t = 0.2;
                ground_factor = 0.2;
            } else {
                ground_factor = 1.0;
                break;
            }
        }

        if (t > 50.0) {
            t = 50.0;
            break;
        }
        t += gd*0.7;
    }
    vec3 p = ro + rd * t;

    vec3 color = mix(sky_color(p), ground_color(p), ground_factor - (mix(0.0, 0.2, t / 50.0)));
    // vec3 color = ground_color(p)*ground_factor;

    out_color += vec4(color, 1.0);
}
