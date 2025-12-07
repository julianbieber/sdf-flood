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

vec3 interpolate(vec3 a, vec3 b) {
    float a_i = length(a);
    float b_i = length(b);
    float s = a_i + b_i;

    float i = a_i / s;
    if (a_i > 0.2) {
        return a;
    }

    return i * a + (1.0 - i) * b;
}

vec3 swirl(vec3 p) {
    for (float a = 1.; a < exp2(9.); a *= 2.) {
        p += (cos(p.yzx * a * T) / (a));
    }
    return p;
}
float hash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

// 3D Perlin noise
float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(mix(hash(i + vec3(0, 0, 0)), hash(i + vec3(1, 0, 0)), f.x),
            mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
        mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x),
            mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}

// Fractal Brownian Motion for terrain generation
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

// Worley noise for rock textures
float worley(vec3 p) {
    vec3 id = floor(p);
    vec3 f = fract(p);

    float min_dist = 1.0;
    for (int x = -1; x <= 1; x++) {
        for (int y = -1; y <= 1; y++) {
            for (int z = -1; z <= 1; z++) {
                vec3 neighbor = vec3(x, y, z);
                vec3 point = hash(id + neighbor) * vec3(1.0) + neighbor;
                float dist = length(point - f);
                min_dist = min(min_dist, dist);
            }
        }
    }
    return min_dist;
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

float terrain_main(vec3 p) {
    return 1.0 - ((tanh(worley(vec3(p.xz * .2 + vec2(p.z * 0.02, 0.0), T)))) * 0.5 + 0.5);
}

float terrain(vec3 p) {
    float ridges = terrain_main(p);
    // float ridges = 1.0 - ((tanh(worley(p))) * 0.5 + 0.5);
    float details = fbm(vec3(p.xz, T), 5);

    return (p.y + ridges * 7.0 + details * 1.0) * 0.7;
    // return sphere(p, 4.0) + ridges + details;
}

Ob map(vec3 p) {
    Ob t = Ob(terrain(p), 0, false);
    return t;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy).d - map(p - h.xyy).d,
            map(p + h.yxy).d - map(p - h.yxy).d,
            map(p + h.yyx).d - map(p - h.yyx).d));
}

vec3 normal_main(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(terrain_main(p + h.xyy) - terrain_main(p - h.xyy),
            terrain_main(p + h.yxy) - terrain_main(p - h.yxy),
            terrain_main(p + h.yyx) - terrain_main(p - h.yyx)));
}

vec3 terrainColor(vec3 p) {
    vec3 n = normal_main(p);
    vec3 a = rgb(255, 255, 255);
    vec3 b = tanh(dot(swirl(p + T), swirl(p * T))) * rgb(19, 46, 107) * 2.3;
    return mix(b, a,tanh((1.0 - n.y) * 0.1) );
}

float gyroid(vec3 p) {
    return dot(sin(p), cos(p.zxy));
}
float fogDensity(vec3 p) {
    return (gyroid(cross(swirl(p.xyz), swirl(p.zxy))));
}
vec3 fogColor(float a, vec3 rd) {
    float capped_a = tanh(min(a, 100.0) * 0.0001 );
    float intensity = 1.0 - pow(2.0, -capped_a * fogDensity(rd));
    return intensity * rgb(127, 46, 48);
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    for (int i = 0; i < 100; ++i) {
        vec3 p = ro + rd * t;

        Ob o = map(p);

        if (o.d < 0.001) {
            vec3 n = normal(p);
            float i = dot(n, vec3(0.2, 0.2, 0.6));
            i = max(0.001, i);
            return interpolate(terrainColor(p) * i * 3.0, fogColor(t, rd));
        }
        t += o.d;
    }

    return vec3(t, rd);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    vec3 ro = vec3(0.0, 4.0, -10.0);
    vec3 rd = normalize(vec3(pixel_position, 1.0));

    out_color = vec4(march(ro, rd), 1.0);
}
