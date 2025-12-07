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

float sky(vec3 p) {
    return -p.y + 10.0;
}

Ob map_ashyn(vec3 p) {
    Ob t = Ob(terrain(p), 0, false);
    Ob f = Ob(sky(p), 1, false);
    return min_ob(t, f);
}

Ob map_roshar(vec3 p, bool portal) {
    Ob t = Ob(terrain(p * 1.3), 2, false);
    Ob f = Ob(sky(p) + 10.0, 3, false);
    Ob m = min_ob(f, t);
    Ob s = Ob(-p.z + 50.0, 4, false);
    m = min_ob(m, s);
    if (portal) {
        Ob p = Ob(sphere(p - vec3(0.0, 5.0, 0.0), 3.0), 5, false);
        return min_ob(m, p);
    } else {
        return m;
    }
}

vec3 normal(vec3 p, bool in_roshar) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    if (in_roshar) {
        return normalize(vec3(map_roshar(p + h.xyy, false).d - map_roshar(p - h.xyy, false).d,
                map_roshar(p + h.yxy, false).d - map_roshar(p - h.yxy, false).d,
                map_roshar(p + h.yyx, false).d - map_roshar(p - h.yyx, false).d));
    } else {
        return normalize(vec3(map_ashyn(p + h.xyy).d - map_ashyn(p - h.xyy).d,
                map_ashyn(p + h.yxy).d - map_ashyn(p - h.yxy).d,
                map_ashyn(p + h.yyx).d - map_ashyn(p - h.yyx).d));
    }
}

float densityF(vec3 p) {
    return 1.0;
}

vec3 densityC(float d) {
    return rgb(180, 65, 51) * d;
}

vec2 rotate2(vec2 p, float angle) {
    return mat2(cos(angle), -sin(angle), sin(angle), cos(angle)) *
        p;
}

float fireWisp(vec2 u, float time, float scale, float i) {
    float path = sin(u.x * (scale + time * 0.8 + i)) * 0.2 +
            sin(u.x * scale * 2.3 + time * 1.1 + i) * 0.1 +
            sin(u.x * scale * 4.7 + time * 0.6 + i) * 0.05;

    // Make fire rise upward
    path += (1.0 - u.y) * 0.3;

    float distance = abs(u.y - path);
    return 1.0 / (distance * 50.0 + 1.0);
}

vec3 fire(vec2 v) {
    vec3 fire_color = rgb(230, 100, 54);

    float fire_intensity = 0.0;

    float end = 20.0;

    v = rotate2(v, T);
    // v *= 10.0;
    vec2 o = v;
    // v *= 10.0;
    // v = sin(v+v);
    for (float i = 1.0; i < end; ++i) {
        float scale = end / i;
        fire_intensity += fireWisp((v), T * i, 10.1 * i + fire_intensity * 10.0, fract(fire_intensity)) * 0.1 * scale;
        v -= vec2(0.0, 0.2 * fire_intensity);
        v.y = abs(v.y);

        vec2 mv = vec2(fire_intensity) + v;
        fire_intensity -= fireWisp(rotate2(mv, scale), -T * scale, 13.3 * i, min(2.0, 1.0 / fire_intensity)) * 0.4;

        // fire_intensity *= fract(sin(T*v.x));
        v = rotate2(v, TAU / end + v.x);
    }

    return fire_color * fire_intensity;
}

vec3 lighning(vec2 v) {
    vec3 baseColor1 = rgb(8, 118, 253);
    vec3 baseColor2 = rgb(186, 48, 223);

    float end = 20.0;

    float intensity_acc = 0.0;
    float inverse_intensity_acc = 0.0;

    vec2 original = v;
    v *= 10.0 + T;
    // v *= dot(v, v)*T;
    // v *= fract(cos(T*32143.1));
    v = rotate2(v, T);
    // v += fract(cos(T*12143.1+v.x))*0.1;

    float background_intensity_acc = 0.0;

    for (float i = 1.0; i < end; ++i) {
        float scale = 1.0 / i;
        float path = sin(v.x * 10.0 + 100.0 * T) * 0.1 +
                sin(v.x * 23.0 + 100.0 * T * 1.3) * 0.05 +
                sin(v.x * 47.0 + 100.0 * T * 0.7) * 0.025;

        float lightning_distance = abs(v.y - path);
        float glow = exp(-lightning_distance - 0.1);
        glow = 1.0;

        vec2 focus_v = original * 10.0;
        focus_v += i * 0.1 + sin(T);

        // focus_v += abs(sin(focus_v*6.0 + T*10.0 + v.x));
        // focus_v = rotate2(focus_v, lightning_distance);

        float focus_distance = max(0.0, 1.0 - length(focus_v));
        focus_distance = 1.0;
        intensity_acc += (1.0 / (lightning_distance * 100.0 + 1.0)) * glow * focus_distance;
        // intensity_acc += glow;

        float background_distance = max(0.0, 3.0 - length(v * background_intensity_acc)) * glow * 2.0 * exp(-intensity_acc);
        background_intensity_acc += background_distance * 0.01 * scale;

        // v = rotate2(v, 1.0/end*2.0*PI+original.x*10.0);
        v = rotate2(v, PI * (1.0 - lightning_distance) * scale);
        // v += intensity_acc*3.0*sin(T);

        // v.y = sin(v.y*2.0);
    }

    vec3 color = baseColor1 * (intensity_acc);
    vec3 background = baseColor2 * background_intensity_acc;
    return mix(color, background, 1.0 - intensity_acc);
}
vec3 color_f(vec3 p, int index, float intensity) {
    if (index == 0) { // ashyn ground
        float l = length(fire(sin(p.xz * 0.01 - vec2(0.0, 2.0))));
        vec3 brown = rgb(60, 32, 23);
        return brown * intensity *l;

    }
    if (index == 1) { // ashyn sky
        return (fire(sin(p.xz * 0.01 - vec2(0.0, 2.0))) + lighning(sin(p.xz * 0.005))*0.1);
    }

    if (index == 2) { // roshar ground
        vec3 brown = rgb(60, 32, 23);
        return brown * intensity;
    }

    if (index == 3) { // roshar sky
        vec3 grey = rgb(188, 204, 220);
        float l = length(lighning(sin(p.xz * 0.005)));
        return grey*smoothstep(0.5, 1.0, fbm(vec3(p.xz, T*10.0), 3)); 
    }

    if (index == 4) { // roshar stormwall
        return lighning(sin(p.xy * 0.005));
    }

    return vec3(0.0);
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    vec3 flatColor = vec3(0.0);
    float density = 0.0;
    bool in_roshar = true;
    bool portal = true;
    for (int i = 0; i < 200; ++i) {
        vec3 p = ro + rd * t;

        Ob o;
        if (in_roshar) {
            o = map_roshar(p, portal);
        } else {
            o = map_ashyn(p);
        }

        if (o.d < 0.001) {
            if (o.c == 5) { // portal to ashyn
                float r = length(p.xy - vec2(0.0, 5.0));
                float h = hash(p*T);
                if (r*h < 3.0* sin(T)) {
                    in_roshar = false;
                    
                }
                portal = false;

                continue;
            }
            if (o.density) {
                t += 0.1;
                density += densityF(p);
            } else {
                vec3 n = normal(p, in_roshar);
                float i = dot(n, vec3(0.0, 1.0, 0.0));
                flatColor = color_f(p, o.c, i);
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
