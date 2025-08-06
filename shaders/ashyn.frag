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

vec3 rgb(int r, int g, int b) {
    return vec3(float(r) / 255.0, float(g) / 255.0, float(b) / 255.0);
}

float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

vec3 interpolate(vec3 a, vec3 b) {
    float a_i = length(a);
    float b_i = length(b);
    float s = a_i + b_i;

    float i = a_i / s;

    return i * a + (1.0 - i) * b;
}

float h2(vec2 n) {
    vec2 v = fract(sin(n) * 43758.5453123);
    return fract(v.x + v.y);
}

float noise(vec3 p) {
    vec2 d = vec2(0.0, 1.0);
    vec2 b = floor(p.xz);
    vec2 f = smoothstep(vec2(0.0), vec2(1.0), fract(p.xz));
    return mix(mix(h2(b), h2(b + d.yx), f.x), mix(h2(b + d.xy), h2(b + d.yy), f.x), f.y);
}

float fbm(vec3 p, int octaves) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 1.0;

    for (int i = 0; i < octaves; i++) {
        value += amplitude * noise(p * frequency);
        amplitude *= 0.5;
        frequency *= 2.0;
    }
    return value;
}

struct Ob {
    float d;
    int c;
    bool density;
};

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

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, float radius) {
    return length(p) - radius;
}

float terrain(vec3 p) {
    return p.y + fbm(p, 5);
}

float fireField(vec3 p) {
    return -p.y + 10;
}

Ob map(vec3 p) {
    Ob t = Ob(terrain(p), 0, false);
    Ob f = Ob(fireField(p), 1, true);
    return min_ob(t, f);
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy).d - map(p - h.xyy).d,
            map(p + h.yxy).d - map(p - h.yxy).d,
            map(p + h.yyx).d - map(p - h.yyx).d));
}

float densityF(vec3 p) {
    return 1.0;
}

vec3 densityC(float d) {
    return rgb(180, 65, 51) * d;
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec3 flatColor = vec3(0.0);
    float density = 0.0;
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;

        Ob o = map(p);

        if (o.d < 0.001) {
            if (o.density) {
                t += 0.1;
                density += densityF(p);
            } else {
                
                vec3 n = normal(p);
                float i = dot(n, vec3(0.0, 1.0, 0.0));
                flatColor = vec3(n);
                break;
            }
        }

        t += o.d;
    }

    vec3 dc = densityC(density);

    return interpolate(dc, flatColor);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    vec3 ro = vec3(0.0, 4.0, -10.0);
    vec3 rd = normalize(vec3(pixel_position, 1.0));

    out_color = vec4(march(ro, rd), 1.0);
}
