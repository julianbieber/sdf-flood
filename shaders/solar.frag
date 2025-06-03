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

const mat3 OKLAB2RGB_A = mat3(
        1.0, 1.0, 1.0,
        0.3963377774, -0.1055613458, -0.0894841775,
        0.2158037573, -0.0638541728, -1.2914855480);

const mat3 OKLAB2RGB_B = mat3(
        4.0767416621, -1.2684380046, -0.0041960863,
        -3.3077115913, 2.6097574011, -0.7034186147,
        0.2309699292, -0.3413193965, 1.7076147010);
vec3 ok(vec3 oklab) {
    vec3 lms = OKLAB2RGB_A * oklab;
    return OKLAB2RGB_B * (lms * lms * lms);
}
vec4 ok(vec4 oklab) {
    return vec4(ok(oklab.xyz), oklab.a);
}

struct Ob {
    float d;
    vec2 c;
    bool density;
};

float smin(float a, float b, float k) {
    k *= 1.0;
    float r = exp2(-a / k) + exp2(-b / k);
    return -k * log2(r);
}

Ob omin(Ob a, Ob b) {
    if (a.d < b.d) {
        return a;
    } else {
        return b;
    }
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
    vec2 c = mix(a.c, b.c, b_diff / (a_diff + b_diff));
    return Ob(d, c, density);
}

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}

float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

Ob map(vec3 p) {
    return Ob(sphere(p, vec3(0.0,  0.0 , 0.0), 0.2), vec2(-0.03, -0.09), false);
}

vec4 foldPlane(vec3 p, vec3 n, float d) {
    float dist = dot(p, n) + d;
    if (dist < 0.0) {
        p -= 2.0 * dist * n;
        return vec4(p, -1.0);
    } else {
        return vec4(p, 1.0);
    }
}

vec3 closestPointOnPlane(vec3 p, vec3 n, float d) {
    float distance = dot(p, n) - d;

    return p - distance * n;
}

vec3 repeated(vec3 p, float s) {
    p = p - round(p / s);
    return p;
}

Ob kifs(vec3 p) {
    Ob m = Ob(100000.0, vec2(0.0, 0.0), false);
    vec3 origin = repeated(p, 40.0);
    // vec3 origin = p;


    for (float i = 0.0; i < 7.0; i += 1.0) {
        p = rotate(p, 0.0, i / 8.0 * PI + u.time* 0.2, i / 16.0 * PI + u.time* 0.3);
        vec3 n1 = rotate(
                normalize(vec3(1.0, 0.0, 0.0)),
                0.0,
                0.0,
                0.0
            );
        vec4 f1 = vec4(0.0);
        f1 = foldPlane(p, n1, i+sin(u.time));
        p = f1.xyz;

        vec3 n2 =
            rotate(
                normalize(vec3(-1.0, 0.0, 0.0)),
                0.0,
                0.0,
                0.0
            );
        vec4 f2 = foldPlane(p, n2, i+sin(u.time));
        p = f2.xyz;

        vec3 n3 = rotate(
                normalize(vec3(0.0, 0.0, 1.0)),
                0.0,
                0.0,
                0.0
            );
        vec4 f3 = foldPlane(p, n3, i+sin(u.time));
        p = f3.xyz;

        vec3 n4 = rotate(
                normalize(vec3(0.0, 0.0, -1.0)),
                0.0,
                0.0,
                0.0
            );
        vec4 f4 = foldPlane(p, n4, i+sin(u.time));
        p = f4.xyz;

        p += abs(sin(u.time));
        // p = rotate(p, i / 8.0 * PI, 0.0, 0.0);
        // p.y -= sin(u.time) * i;
        // p.x -= 1.2 * i + sin(i);
        Ob o = map(p);
        o.c = o.c + vec2(cos((f1.a + f2.a + f3.a + f4.a) *i), sin((f1.a + f2.a + f3.a + f4.a) * i));
        m = osmin(m, o, 0.3);
        // m = omin(m, o);
        p = origin;
    }

    return m;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(kifs(p + h.xyy).d - kifs(p - h.xyy).d,
            kifs(p + h.yxy).d - kifs(p - h.yxy).d,
            kifs(p + h.yyx).d - kifs(p - h.yyx).d));
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec3 p = ro;
    for (int i = 0; i < 100; ++i) {
        Ob o = kifs(p);
        if (o.d < 0.001) {
            vec3 n = normal(p);
            float l = dot(n, normalize(vec3(
                            sin(u.time*10.0) * 10.0,
                            cos(u.time) * 10.0,
                            sin(u.time * 2.0) * 5.0 - 5.0)));
            l = max(l, 0.0);
            return ok(vec3(l, o.c));
        }
        rd = mix(rd, rd + vec3(1.0, 0.0, 1.0), 0.01);
        p = p + rd * o.d;
    }
    return vec3(0.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = vec4(march(vec3(pixel_position, -10.0) - ray_direction * u.time, (ray_direction) ), 1.0);
}
