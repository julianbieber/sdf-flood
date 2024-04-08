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
    vec3 id;
};

struct RayEnd {
    SceneSample s;
    vec3 current_position;
    float dimension;
};

struct BlackHoleDistance {
    vec3 center;
    float distance; // distance to schwartzschield radius
    float effect_radius; // how far outside of schwartzschield radius does the black hole have an effect
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

SceneSample combine(SceneSample a, SceneSample b) {
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
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

vec3 hash3(vec2 p)
{
    vec3 q = vec3(dot(p, vec2(127.1, 311.7)),
            dot(p, vec2(269.5, 183.3)),
            dot(p, vec2(419.2, 371.9)));
    return fract(sin(q) * 43758.5453);
}
vec2 hash2(vec2 p)
{
    vec2 q = vec2(dot(p, vec2(127.1, 311.7)),
            dot(p, vec2(269.5, 183.3)));
    return fract(sin(q) * 43758.5453);
}

float voronoise(vec2 p, float u, float v)
{
    float k = 1.0 + 63.0 * pow(1.0 - v, 6.0);

    vec2 i = floor(p);
    vec2 f = fract(p);

    vec2 a = vec2(0.0, 0.0);
    for (int y = -4; y <= 4; y++)
        for (int x = -4; x <= 4; x++)
        {
            vec2 g = vec2(x, y);
            vec3 o = hash3(i + g) * vec3(u, u, 1.0);
            // vec2  d = normalize(g - f + o.xy);
            vec2 d = vec2(1.3, 0.0);
            float w = pow(1.0 - smoothstep(0.0, 1.414, length(d)), k);
            a += vec2(o.z * w, w);
        }

    return a.x / a.y;
}

float smoothVoronoi(in vec2 x)
{
    vec2 p = floor(x);
    vec2 f = fract(x);

    float res = 0.0;
    for (int j = -2; j <= 2; j++)
        for (int i = -2; i <= 2; i++)
        {
            vec2 b = vec2(i, j);
            vec2 r = vec2(b) - f + hash2(p + b);
            float d = length(r);

            res += exp2(-32.0 * d);
        }
    return -(1.0 / 32.0) * log2(res);
}
float fbm(vec2 x, float H) {
    float t = 0.0;
    for (int i = 0; i < 4; i++)
    {
        float f = pow(1.2, float(i));
        float a = pow(f, -H);
        t += a * noise(f * x);
    }
    return t;
    // return voronoise(x , 1.0, 1.0) * 1.0;
}
float sdPlane(vec3 p, vec3 n, float h) {
    return dot(p, n) + h;
}

float surface(vec3 p, float dimension) {
    float plane = sdPlane(p, vec3(0.0, 1.0, 0.0), 0.0);
    plane -= (fbm(p.xz * 0.4, 0.4 * (dimension + 1.0))) * 0.8;

    return plane;
}

float sky_distance(vec3 p, vec3 id) {
    return sphere(p, vec3(noise(id.zy)*4.0, noise(id.xy)*5.0, noise(id.yz)*3.0) , noise(id.xz));
    // return sdPlane(p, vec3(0.0, -1.0, 0.0), 21.0);
}

SceneSample scene(vec3 p, float dimension) {
    SceneSample ground = SceneSample(surface(p + vec3(u.time * (dimension * 20.0 + 1.0), 0.0, u.time), dimension), 1, vec3(0));
    float s = 15.0;
    vec3 id = round(p / s);
    vec3 r = p - s * id;
    float d = 1e20;
    vec3 o = sign(p - s * id);
    float boundary = sdPlane(p, vec3(0.0, -1.0, 0.0), 27.0);
    for (int j = 0; j < 3; j++)
        for (int i = 0; i < 3; i++)
            for (int k = 0; k < 3; k++)
            {
                vec3 rid = id + vec3(i, j, k) * o;
                vec3 r = p - s * rid;
                d = min(d, sky_distance(r, rid));
            }

    SceneSample sky = SceneSample(max(d, boundary), 2, id);

    return combine(ground, sky);
}
SceneSample fastscene(vec3 p, float dimension) {
    SceneSample ground = SceneSample(surface(p + vec3(u.time * (dimension * 20.0 + 1.0), 0.0, u.time), dimension), 1, vec3(0));
    return ground;
}

BlackHoleDistance b_h_scene(vec3 p) {
    vec3 center = vec3(cos(u.time * 0.25) * 4.0, sin(u.time * 0.03) * 30.0 + 10.0, (abs(sin(u.time * 0.3)) * 3.0) + 30.0);
    float outer = abs(sin(u.time * 0.22)) * 20.0;
    return BlackHoleDistance(center, sphere(p, center, min(5.0, outer * 0.8)), outer);
}

float scene_f(vec3 p, float dimension) {
    return fastscene(p, dimension).closest_distance;
}

vec3 normal(vec3 p, float dimension) {
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene_f(p + h.xyy, dimension) - scene_f(p - h.xyy, dimension),
            scene_f(p + h.yxy, dimension) - scene_f(p - h.yxy, dimension),
            scene_f(p + h.yyx, dimension) - scene_f(p - h.yyx, dimension)));
}

float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

RayEnd follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    float traveled = 0.0;
    float dimension = 0.0;
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        SceneSample s = scene(p, dimension);
        if (s.closest_distance < 0.01) {
            return RayEnd(s, p, dimension);
        }
        BlackHoleDistance b = b_h_scene(p);
        if (b.distance < 0.01) {
            dimension += 1.0;
        }
        float t = s.closest_distance;
        if (b.distance < b.effect_radius) {
            float scale = smoothstep(0.6, 0.3, (b.distance / b.effect_radius));
            direction = normalize(mix(direction, normalize(b.center - p), (scale)));
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += t;
    }

    return RayEnd(SceneSample(traveled, -1, vec3(0)), start + direction * traveled, dimension);
}
vec2 circle(float angle) {
    return vec2(cos(angle), sin(angle));
}

vec4 resolve_color(int index, vec3 p, float dimension, vec3 id) {
    if (index == 1 && dimension == 0) {
        vec3 n = normal(p, dimension);
        vec2 sun = 10.0 * circle(u.time * 0.1);
        vec3 white = vec3(1.0);
        vec3 blue = vec3(0.0, 0.0, 1.0);
        float f = (p.y) * 0.02;
        float light = dot(n, vec3(0.0, sun.x + 5.0, sun.y));
        vec3 inter = (f * white + (1.0 - f) * blue) * light;
        // vec3 noise_factor = vec3(noise(p.xy * dimension), noise(p.xy * dimension), noise(p.xy * dimension));
        vec3 noise_factor = vec3(0.0);
        return vec4(inter + noise_factor, 1.0);
    }
    if (index == 2) {
        return vec4(vec3(noise(p.xz), noise(p.xz * 2.03), noise(p.xz * 2.02)), 1.0);
    }

    return vec4(0);
}

vec4 render(vec3 eye, vec3 ray) {
    RayEnd end = follow_ray(eye, ray, 100, 100.0);
    if (end.s.index == -1) {
        return vec4(0.0);
    }
    vec4 color = resolve_color(end.s.index, end.current_position, end.dimension, end.s.id);
    return color;
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(0.0, 20.0, -10.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
