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
#define T u.time * 0.2

struct Ob {
    float d;
    int c;
    bool density;
};

vec3 swirl(vec3 p) {
    for (float a = 1.; a < exp2(9.); a *= 2.) {
        p += cos(p.yzx * a + u.time) / a;
    }
    return p;
}
vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, float radius) {
    return length(p) - radius;
}

float gyroid(vec3 p) {
    return dot(sin(p), cos(p.zxy));
}

Ob min_ob(Ob a, Ob b) {
    if (a.density) {
        a.d = max(0.0, a.d);
    }
    if (b.density) {
        b.d = max(0.0, b.d);
    }
    if (a.d <= b.d) {
        return a;
    } else {
        return b;
    }
}

Ob max_ob(Ob a, Ob b) {
    if (a.density) {
        a.d = max(0.0, a.d);
    }
    if (b.density) {
        b.d = max(0.0, b.d);
    }
    if (a.d >= b.d) {
        return a;
    } else {
        return b;
    }
}

vec3 foldPlane(vec3 p, vec3 n, float d) {
    float dist = dot((p), n) + d;
    if (dist < 0.0) {
        p -= 2.0 * dist * n;
    }
    return p;
}

vec3 kifs_color(vec3 p) {
    vec3 plane_dir_x = normalize(vec3(1.0, 0.0, 0.0));
    vec3 plane_dir_y = normalize(vec3(0.0, 1.0, 0.0));
    vec3 plane_dir_z = normalize(vec3(0.0, 0.0, 1.0));

    for (int i = 0; i < 12; ++i) {
        p = foldPlane(p, plane_dir_x, 0.1);
        p = foldPlane(p, plane_dir_y, 0.1 * float(i));
        p = rotate(p, T, 0.1, 0.0);
    }
    return sin(p) * 0.5 + 0.5;
}

Ob map(vec3 p) {
    Ob s = Ob(abs(sphere(p, 3.0)) - 0.3, 0, false);
    // s.d += gyroid(p * T + 0.3) * 0.03;
    s.d += length(kifs_color(p * T + 0.3)) * 0.02;
    Ob g = Ob((gyroid(swirl(rotate(p * 5.0, 0.0, T * 0.2, T * PI * 0.1)))), 0, false);
    Ob c = max_ob(s, g);
    c.d *= 0.6;

    float storm_radius = sphere(p, 3.8);
    storm_radius = storm_radius - normalize(kifs_color(p * T)).y * 0.3;

    Ob storm = Ob(storm_radius, 1, true);

    c = min_ob(c, storm);
    // c = min_ob(c, Ob(sphere(p - 3.3, 1.3), 0, true));
    return c;
}

Ob kifs_map(vec3 p) {
    vec3 plane_dir_x = normalize(vec3(1.0, 0.0, 0.0));
    vec3 plane_dir_y = normalize(vec3(0.0, 1.0, 0.0));
    vec3 plane_dir_z = normalize(vec3(0.0, 0.0, 1.0));
    // float plane = gyroid(vec3(T, 0.3 * T, 0.7*T)) + gyroid(p);
    float plane = 0.5;
    for (int i = 0; i < 8; ++i) {
        // vec3 lp = p;
        p = foldPlane(p, plane_dir_x, plane * float(i));
        // p = foldPlane(p, plane_dir_x, float(i) / 7.0);
        p = foldPlane(p, plane_dir_y, plane * float(i));
        // p = foldPlane(p, plane_dir_y, float(i) / 7.0);
        // p = foldPlane(p , plane_dir_z, plane*float(i));
        // p = foldPlane(p , plane_dir_z, float(i) / 7.0);

        // p = rotate(p, T*PI * 3.4, PI * T*.06, PI * T*0.33);
        // p = rotate(p,T*PI, T * PI, T * PI);
        p = rotate(p, PI / 2.0, T, PI / 2.0);
        p = foldPlane(p, plane_dir_x, plane * float(i));
        p = foldPlane(p, plane_dir_y, plane * float(i));
        p = rotate(p, PI, T, PI);
        // p.xyz -= 0.1;

        // p *= 1.2;
        // p.x += 0.4;
    }
    // return Ob(length(p) - 1.5, 1, false);
    return map(p * 10.1);
    // return Ob(p.x, 1, false);
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy).d - map(p - h.xyy).d,
            map(p + h.yxy).d - map(p - h.yxy).d,
            map(p + h.yyx).d - map(p - h.yyx).d));
}

vec3 sun_pos() {
    vec3 center = vec3(0.0);

    vec3 start = vec3(10.0, 10.0, 0.0);

    return rotate(start - center, 0.0, T / PI, T);
}

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}

vec3 interpolate(vec3 a, vec3 b) {
    float a_i = length(a);
    float b_i = length(b);
    float s = a_i + b_i;

    float i = a_i / s;

    return i * a + (1 - 0 - i) * b;
}

vec3 density_color(float density) {
    float intensity = 1.0 - pow(2.0, -density);

    vec3 base = rgb(90, 145, 211);
    return intensity * base;
}

float density_f(vec3 p) {
    vec3 k = kifs_color(swirl(p));
    float a = gyroid(swirl(rotate(k * 5.0, 0.0, T * 0.2, T * PI * 0.1)));
    return mix(0.0, 0.14, a);
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec3 sun = sun_pos();
    vec3 sun_dir = normalize(sun);

    float density_acc = 0.0;
    float density_acc_2 = 0.0;

    vec3 flat_color = vec3(0.0);
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;
        if (t > 100.0) {
            break;
        }

        // Ob o = kifs_map(p);
        Ob o = map(p);
        if (o.d < 0.001) {
            if (o.density) {
                vec3 n = normal(p);
                float i = dot(n, sun_dir);
                i = max(0.5, i);
                density_acc += density_f(p) * i;
            } else {
                vec3 n = normal(p);
                float i = dot(n, sun_dir);
                i = max(0.2, i);

                flat_color = kifs_color(p) * i;
                break;
            }
        }
        if (o.d < 0.001 && o.density) {
            t += 0.1;
        } else {
            t += o.d;
        }
    }

    vec3 d_c = density_color(density_acc);

    return interpolate(flat_color, d_c);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    vec3 c = march(vec3(pixel_position, -10.0), ray_direction);
    out_color = vec4(c, 1.0);

    // out_color = vec4(kifs_color(vec3(pixel_position, -10.0)+ ray_direction*T), 1.0);
}
