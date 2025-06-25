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

#define PI 3.1415926538
#define TAU 6.2831853071
#define FOV 60.0

const mat3 OKRGB_A = mat3(
        1.0, 1.0, 1.0,
        0.39633, -0.10556, -0.08948,
        0.2158, -0.06385, -1.29148
    );
const mat3 OKRGB_B = mat3(
        4.07674, -1.26843, -0.00419,
        -3.30771, 2.60975, -0.70341,
        0.23096, -0.34131, 1.70761
    );

vec3 oklab(vec3 c) {
    vec3 l = OKRGB_A * c;
    return OKRGB_B * (l * l * l);
}

struct Ob {
    float d;
    float c;
    bool density;
};
vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sdSphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    return (p.x + p.y + p.z - s) * 0.57735027;
}

float smin(float a, float b, float k) {
    k *= 1.0;
    float r = exp2(-a / k) + exp2(-b / k);
    return -k * log2(r);
}
Ob osmin(Ob a, Ob b, float k) {
    float d = smin(a.d, b.d, k);
    if (d == a.d) {
        return a;
    }
    if (d == b.d) {
        return b;
    }
    float a_diff = abs(a.d - d);
    float b_diff = abs(b.d - d);
    bool density = a.density && b.density;
    float c = mix(a.c, b.c, b_diff / (a_diff + b_diff));
    return Ob(d, c, density);
}

Ob omin(Ob a, Ob b) {
    if (a.d < b.d) {
        return a;
    } else {
        return b;
    }
}

vec3 repeated(vec3 p, float s) {
    p = p - round(p / s);
    return p;
}
// Ob map(vec3 p, float color) {
//     // p = rotate(p, 0.0, u.time, 0.0);
//     Ob a = Ob(sdSphere(p, vec3(3.0, 0.0, 0.0), 1.0), 1.0 + color, false);
//     Ob c = Ob(sdSphere(p, vec3(-3.0, 0.0, 0.0), 1.0), 1.0 + color, false);
//     a = omin(a, c);
//     Ob b = Ob(sdOctahedron(p, 1.0), 0.0 + color, false);

//     return omin(a, b);
//     // return b;
// }
//
float sdBox(vec3 p, vec3 b) {
    vec3 q = abs(p) - b;
    return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}
Ob map(vec3 p, float color) {
    return Ob(sdBox(p, vec3(1.0)), color, false);
}

vec3 foldPlane(vec3 p, vec3 n, float d) {
    // signed distance from p to plane
    float dist = dot(p, n) + d;
    // if on positive side, reflect across plane
    if (dist < 0.0) {
        p -= 2.0 * dist * n;
    }
    return p;
}

Ob kif_map(vec3 p) {
    Ob m = Ob(100000.0, 2, false);
    // vec3 plane_dir = normalize(vec3(1.0, sin(u.time * 0.2)* PI, (u.time * 0.6)));
    vec3 plane_dir = normalize(vec3(1.0, u.time, 0.0));
    float plane = 0.0;
    for (int i = 0; i < 5; ++i) {
        p = foldPlane(p, plane_dir, plane);
        Ob lm = map(p, float(i));
        // if (lm.d < m.d) {
            m = omin(m, lm);
            // plane += 3.0;
            // plane_dir = rotate(plane_dir, 0.0,  PI / 2.0, 0.0);
            p *= 1.5;
            p += vec3(3.0, 0.0, 0.0);
        // }
        // p.y += 0.2;
        // plane_dir = rotate(plane_dir, 0.5 * PI, 0.8 * PI+ u.time*0.2, 0.7);
    }

    return m;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(kif_map(p + h.xyy).d - kif_map(p - h.xyy).d,
            kif_map(p + h.yxy).d - kif_map(p - h.yxy).d,
            kif_map(p + h.yyx).d - kif_map(p - h.yyx).d));
}

vec3 col(vec3 p, float o) {
    vec3 n = normal(p);
    vec3 l = normalize(vec3(10.0, 10.0, 1.0));
    float i = max(0.2, dot(n, l));
    return abs(vec3(sin(o), sin(o + 1.0), sin(o + 2.0))) * i;
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;
        Ob o = kif_map(p);
        if (o.d < 0.001) {
            return col(p, o.c);
        }
        t += o.d * 0.8;
    }
    return vec3(0.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position + vec2(0.0, 0.1), 1.0));

    out_color = vec4(march(vec3(pixel_position + vec2(0.0, 3.0), -30.0), ray_direction), 1.0);
}
