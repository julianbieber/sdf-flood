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

vec3 oklab2rgb(vec3 oklab) {
    vec3 lms = OKLAB2RGB_A * oklab;
    return OKLAB2RGB_B * (lms * lms * lms);
}

vec4 oklab2rgb(vec4 oklab) {
    return vec4(oklab2rgb(oklab.xyz), oklab.a);
}

vec4 permute(vec4 x) {
    return mod(((x*34.0)+1.0)*x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
    return t*t*t*(t*(t*6.0-15.0)+10.0);
}

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P);        // Integer part for indexing
    vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P);        // Fractional part for interpolation
    vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0

    vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
    vec4 iy = vec4(Pi0.yy, Pi1.yy);
    vec4 iz0 = Pi0.zzzz;
    vec4 iz1 = Pi1.zzzz;

    vec4 ixy = permute(permute(ix) + iy);
    vec4 ixy0 = permute(ixy + iz0);
    vec4 ixy1 = permute(ixy + iz1);

    vec4 gx0 = ixy0 / 7.0;
    vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
    gx0 = fract(gx0);
    vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
    vec4 sz0 = step(gz0, vec4(0.0));
    gx0 -= sz0 * (step(0.0, gx0) - 0.5);
    gy0 -= sz0 * (step(0.0, gy0) - 0.5);

    vec4 gx1 = ixy1 / 7.0;
    vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
    gx1 = fract(gx1);
    vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
    vec4 sz1 = step(gz1, vec4(0.0));
    gx1 -= sz1 * (step(0.0, gx1) - 0.5);
    gy1 -= sz1 * (step(0.0, gy1) - 0.5);

    vec3 g000 = vec3(gx0.x, gy0.x, gz0.x);
    vec3 g100 = vec3(gx0.y, gy0.y, gz0.y);
    vec3 g010 = vec3(gx0.z, gy0.z, gz0.z);
    vec3 g110 = vec3(gx0.w, gy0.w, gz0.w);
    vec3 g001 = vec3(gx1.x, gy1.x, gz1.x);
    vec3 g101 = vec3(gx1.y, gy1.y, gz1.y);
    vec3 g011 = vec3(gx1.z, gy1.z, gz1.z);
    vec3 g111 = vec3(gx1.w, gy1.w, gz1.w);

    vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), 
                                  dot(g100, g100), dot(g110, g110)));
    g000 *= norm0.x;
    g010 *= norm0.y;
    g100 *= norm0.z;
    g110 *= norm0.w;

    vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), 
                                  dot(g101, g101), dot(g111, g111)));
    g001 *= norm1.x;
    g011 *= norm1.y;
    g101 *= norm1.z;
    g111 *= norm1.w;

    float n000 = dot(g000, Pf0);
    float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
    float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
    float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
    float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
    float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
    float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
    float n111 = dot(g111, Pf1);

    vec3 fade_xyz = fade(Pf0);
    vec4 n_z = mix(vec4(n000, n100, n010, n110),
                   vec4(n001, n101, n011, n111), fade_xyz.z);
    vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
    float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x);
    return 2.2 * n_xyz;
}

float fbm(vec3 position, int octaves, float lacunarity, float gain) {
    float value = 0.0;
    float amplitude = 0.5;
    float frequency = 3.0;
    
    for(int i = 0; i < octaves; i++) {
        value += amplitude * cnoise(position * frequency);
        frequency *= lacunarity;
        amplitude *= gain;
    }
    return value;
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

// Base octahedron SDF from Inigo Quilez
float sdOctahedron(vec3 p, float s) {
    p = abs(p);
    float m = p.x + p.y + p.z - s;
    vec3 q;
    if (3.0 * p.x < m) q = p.xyz;
    else if (3.0 * p.y < m) q = p.yzx;
    else if (3.0 * p.z < m) q = p.zxy;
    else return m * 0.57735027;
    float k = clamp(0.5 * (q.z - q.y + s), 0.0, s);
    return length(vec3(q.x, q.y - s + k, q.z - k));
}

float sdCarvedEmerald(vec3 p, float size) {
    p /= size; // Normalize coordinates

    // Create stepped carving effect
    const int tiers = 4;
    float carveDepth = 0.05;
    for (int i = 0; i < tiers; i++) {
        float y = 0.8 - 0.15 * float(i);
        p.y = abs(p.y) - y; // Symmetrical tiers
        p = abs(p) - vec3(0.1 + 0.05 * float(i)); // Gradual horizontal reduction
    }

    // Base gem profile using modified octahedron
    p.y *= 0.7; // Vertical elongation
    float d = sdOctahedron(p, 1.0);

    // Table facet (flat top)
    d = max(d, p.y - 0.7);

    return d * size;
}

float scene(vec3 p) {
    return sdCarvedEmerald(p, 1.0);
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(scene(p + h.xyy) - scene(p - h.xyy),
            scene(p + h.yxy) - scene(p - h.yxy),
            scene(p + h.yyx) - scene(p - h.yyx)));
}
float fov_factor() {
    return tan(FOV / 2.0 * PI / 180.0);
}

vec4 follow_ray_in_emerald(vec3 start, vec3 direction) {
    float traveled = 0.0;

    float intensity = 0.0;

    for (int i = 0; i < 20; ++i) {
        vec3 p = start + direction * traveled;
        traveled += 0.04;
        p.xz *= mat2(0.9, -0.8, 0.8, 0.9);
        float n = fbm(vec3(p.xy, u.time / 10.0), 5, 3.2, 0.5);
        intensity += n/ 2.0;
        // intensity = exp(-intensity * 0.05);
    }

    intensity = mix(0.1, 0.3, intensity);
    
    vec3 blue = oklab2rgb(vec3(intensity, -0.03, -0.09));
    return vec4(blue, intensity);
}

vec4 follow_ray(vec3 start, vec3 direction, int steps, float max_dist) {
    vec3 green = oklab2rgb(vec3(0.89, -0.18, 0.05));
    float traveled = 0.0;
    vec3 light_origin = vec3(10.0, 5.0, 10.0);
    for (int i = 0; i < steps; ++i) {
        vec3 p = start + direction * traveled;
        float distance = scene(p);
        if (distance < 0.01) {
            vec3 n = normal(p);
            vec3 l = normalize(p - light_origin);
            float light_factor = dot(n, l);

            vec4 in_color = follow_ray_in_emerald(p, -l);

            vec3 mixed = mix(green, in_color.xyz, in_color.w);

            return vec4(mixed * light_factor, 1.0);
        }
        if (traveled >= max_dist) {
            break;
        }
        traveled += distance;
    }

    vec4 in_color = follow_ray_in_emerald(start + direction * u.time / 10.0, direction);

    return vec4(in_color.xyz, 1.0);
}

vec4 render(vec3 eye, vec3 ray) {
    return follow_ray(eye, ray, 100, 100.0);
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = normalize(vec3(pixel_position, 1.0));

    out_color = render(vec3(0.0, 0.0, -10.0), ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}

