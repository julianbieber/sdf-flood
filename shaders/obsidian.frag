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

float voronoi(vec3 p) {
    vec3 id = floor(p);
    vec3 f = fract(p);

    float m = 10000.0;
    for (float x = -1; x <= 1.0; x = x + 1.0) {
        for (float y = -1; y <= 1.0; y = y + 1.0) {
            for (float z = -1; z <= 1.0; z = z + 1.0) {
                vec3 offset = vec3(x,y,z);
                vec3 r = offset - f + hash(id + offset);
                float d= dot(r,r);
                m = min(m, d);
            }
        }
    }
    return m;
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
float box(vec3 p, vec3 b) {
    vec3 d = abs(p) - b;
    return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}
float obsidianDistance(vec3 p) {
    float sphere = sphere(p, 1.0);
    sphere += voronoi(vec3(uv, T)*19.0*T) * 0.15;
    float box = box(p, vec3(0.8, 1.2, 0.9));
    return max(sphere, box);
}

Ob map(vec3 p) {
    return Ob(obsidianDistance(p), 0, false);
}

float fresnel(vec3 viewDir, vec3 normal, float ior) {
    float cosI = dot(-viewDir, normal);
    float sinT2 = (1.0 - cosI * cosI) / (ior * ior);
    if (sinT2 > 1.0) return 1.0;
    float cosT = sqrt(1.0 - sinT2);
    float rs = (ior * cosI - cosT) / (ior * cosI + cosT);
    float rp = (cosI - ior * cosT) / (cosI + ior * cosT);
    return (rs * rs + rp * rp) * 0.5;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy).d - map(p - h.xyy).d,
            map(p + h.yxy).d - map(p - h.yxy).d,
            map(p + h.yyx).d - map(p - h.yyx).d));
}

vec3 obsidianColor(vec3 pos, vec3 normal, vec3 viewDir, float depth) {
    vec3 baseColor = vec3(0.05, 0.05, 0.08); // Very dark base

    // Add slight translucency based on thickness
    float thickness = 1.0 / (depth + 0.1);
    vec3 translucent = vec3(0.1, 0.05, 0.02) * thickness;

    // High reflectivity
    float reflectivity = fresnel(viewDir, normal, 1.5);

    return mix(baseColor + translucent, vec3(0.3), reflectivity);
}

vec3 march(vec3 ro, vec3 rd) {
    float t = 0.0;
    bool inObject = false;
    float depth = 0.0;
    vec3 n = vec3(0.0);
    for (int i = 0; i < 400; ++i) {
        vec3 p = ro + rd * t;

        Ob o = map(p);

        if (inObject) {
            if (o.d > 0.001) { // left the object
                // float i = dot(n, vec3(0.0, 1.0, 0.0));
                return obsidianColor(p, n, rd, depth);
            } else {
                t += max(abs(o.d), 0.001);
                depth += max(abs(o.d), 0.001);
                // return vec3(o.d* 1000.00);
            }
        } else {
            if (o.d < 0.001) {
                n = normal(p);
                inObject = true;
            }
            t += o.d;
        }
    }

    return vec3(0.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    vec3 ro = vec3(0.0, 0.0, -10.0);
    vec3 rd = normalize(vec3(pixel_position, 1.0));

    out_color = vec4(march(ro, rd), 1.0);
}
