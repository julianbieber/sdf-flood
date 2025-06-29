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
struct Ob {
    float d;
    int c;
    bool density;
};
vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, float radius) {
    return length(p) - radius;
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

vec3 kif(vec3 p) {
    for (int i = 0; i < 6; ++i) {
        p = foldPlane(p, vec3(1.0, 0.0, 0.0), float(i) / 6.0);
        p = foldPlane(p, vec3(0.0, 1.0, 0.0), float(i) / 6.0);
        p = foldPlane(p, vec3(0.0, 0.0, 1.0), float(i) / 6.0);
        p = rotate(p, T, 0.1, 0.0);
    }

    return p;
}

vec3 kifColor(vec3 p) {
    vec3 k = kif(p);
    return sin(k) * 0.5 + 0.5;
}

vec3 groundColor(vec3 p) {
    vec3 green = rgb(79, 101, 37);
    vec3 k = kifColor(p);
    k = smoothstep(-100.0, 100.0, k);

    return green; //* max(max(k.x, k.y), k.z); //+ smoothstep(8.0, 170.0, p.y) * 0.3;
}

float hash(vec3 p) {
    return fract(sin(p.x * 43287.1233) * fract(sin(p.y * 2133.213)) * sin(p.z * 213214.1));
}
vec3 hash3(vec3 p) {
    return fract(sin(p * vec3(43287.1233, 2137.1243523, 7324.132)) );
}

float valueNoise1(vec3 p) {
    vec3 fl = floor(p);
    vec3 fr = fract(p);

    vec3 u = fr*fr*fr*(fr*(fr*6.0-15.0)+10.0);

    vec3 center = hash3(fl);
    float vcenter = dot(center, fr);

    vec3 x = hash3(fl + vec3(1.0, 0.0, 0.0));
    float vx = dot(x, fr - vec3(1.0, 0.0, 0.0));

    vec3 y = hash3(fl + vec3(0.0, 1.0, 0.0));
    float vy = dot(y, fr - vec3(0.0, 1.0, 0.0));

    vec3 z = hash3(fl + vec3(0.0, 0.0, 1.0));
    float vz = dot(z, fr - vec3(0.0, 0.0, 1.0));

    vec3 xy = hash3(fl + vec3(1.0, 1.0, 0.0));
    float vxy = dot(xy, fr - vec3(1.0, 1.0, 0.0));

    vec3 yz = hash3(fl + vec3(0.0, 1.0, 1.0));
    float vyz = dot(yz, fr - vec3(0.0, 1.0, 1.0));

    vec3 xz = hash3(fl + vec3(1.0, 0.0, 1.0));
    float vxz = dot(xz, fr - vec3(1.0, 0.0, 1.0));

    vec3 xyz = hash3(fl + vec3(1.0, 1.0, 1.0));
    float vxyz = dot(xyz, fr - vec3(1.0));

    return vcenter +
    u.x * (vx - vcenter) +
    u.y * (vy - vcenter) +
    u.z * (vz - vcenter) +
    u.x * u.y * (vcenter - vx - vy + vxy) +
    u.y * u.z * (vcenter - vy - vz + vyz) +
    u.x * u.z * (vcenter - vx - vz + vxz) +
    u.x * u.y * u.y * (-vcenter + vx + vy + vz - vxy - vyz - vxz + vxyz);
}

float fbm(vec3 p, float h) {
    float g = exp2(-h);
    float f = 1.0;
    float a = 1.0;
    float t = 0.0;

    for (int i = 0; i < 6; ++i) {
        t += valueNoise1(f * p) * a;
        f *= 2.0;
        a *= g;
    }
    return t;
}

float flameCollioder(vec3 p) {
    float s = 3.0;
    vec2 id = round(p.xz / s);
    p.xz = p.xz - s * id;
    return sphere(p, 0.4);
}

float terrain(vec3 p) {
    float r = hash(p);
    vec3 k = smoothstep(-1.0, 1.0, kif(p));
    float x1 = smoothstep(-10.0, 10.0, p.x)+ .1;
    float x2 = smoothstep(-10.0, 10.0, p.z) + 0.1;
    float x3 = smoothstep(-10.0, 10.0, p.x * p.z);

    float x4 = x1 * (x1 * 3.0) + x2 * x2 * 1.5 + x3 * x3 * 1.3;

    return (x4 + fbm(vec3(p.xz * 0.1, 0.0), 0.5));
}

Ob map(vec3 p) {
    float height = terrain(p) - 1.0;
    float flame = flameCollioder(p - vec3(0.0, height, 0.0));
    Ob t = Ob((p.y - height)* 1.0 , 0, false);
    Ob f = Ob(flame, 1, true);
    return min_ob(t,f);
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy).d - map(p - h.xyy).d,
            map(p + h.yxy).d - map(p - h.yxy).d,
            map(p + h.yyx).d - map(p - h.yyx).d));
}

vec3 sunPos() {
    vec3 center = vec3(0.0);

    vec3 start = vec3(10.0, 10.0, 0.0);

    return rotate(start - center, 0.0, T / PI, T);
}

float gyroid(vec3 p) {
    return dot(sin(p), cos(p.zxy));
}
vec3 swirl(vec3 p) {
    for (float a = 1.; a < exp2(9.); a *= 2.) {
        p += cos(p.yzx * a + T) / a;
    }
    return p;
}
float density_f(vec3 p) {
    vec3 k = kifColor(swirl(p));
    float a = gyroid(swirl(rotate(k * 5.0, 0.0, T * 0.2, T * PI * 0.1)));
    return mix(0.0, 0.14, a);
}
vec3 densityColor(float density) {
    float intensity = 1.0 - pow(2.0, -density);

    vec3 base = rgb(90, 145, 211);
    return intensity * base;
}

vec3 interpolate(vec3 a, vec3 b) {
    float a_i = length(a);
    float b_i = length(b);
    float s = a_i + b_i;

    float i = a_i / s;

    return i * a + (1.0 - i) * b;
}
vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    float fd= 0.0;
    vec3 flatColor = vec3(0.0);
    for (int i = 0; i < 150; ++i) {
        vec3 p = ro + rd * t;
        Ob d = map(p);
        if (d.d < 0.001) {
            if (d.density) {
                t += 0.04;
                fd+=density_f(p); 
            } else {
                vec3 n = normal(p);
                vec3 sun = normalize(sunPos());
                float i = dot(n, sun);
                vec3 c = groundColor(p);

                flatColor = c * i;
                break;
            }
        } else {
            t += d.d;
        }
    }

    vec3 f = densityColor(fd);
    // f = vec3(0.0);

    return interpolate(f, flatColor);
}

void main() {
    vec2 pixelPosition = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 rayDirection = normalize(vec3(pixelPosition, 1.0));

    out_color = vec4(march(vec3(pixelPosition.x, pixelPosition.y + 2.0, -10.0), rayDirection), 1.0);
}
