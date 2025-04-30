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
#define GOLDEN_RATIO 1.6180339887498948482

const mat3 RGB2OKLAB_A = mat3(
    0.2104542553, 1.9779984951, 0.0259040371,
    0.7936177850, -2.4285922050, 0.7827717662,
    -0.0040720468, 0.4505937099, -0.8086757660);

const mat3 RGB2OKLAB_B = mat3(
    0.4122214708, 0.2119034982, 0.0883024619,
    0.5363325363, 0.6806995451, 0.2817188376,
    0.0514459929, 0.1073969566, 0.6299787005);

vec3 rgb2oklab(vec3 rgb) {
    vec3 lms = RGB2OKLAB_B * rgb;
    return RGB2OKLAB_A * (sign(lms)*pow(abs(lms), vec3(0.3333333333333)));

}
vec4 rgb2oklab(vec4 rgb) { return vec4(rgb2oklab(rgb.rgb), rgb.a); }

const mat3 OKLAB2RGB_A = mat3(
        1.0, 1.0, 1.0,
        0.3963377774, -0.1055613458, -0.0894841775,
        0.2158037573, -0.0638541728, -1.2914855480);

const mat3 OKLAB2RGB_B = mat3(
        4.0767416621, -1.2684380046, -0.0041960863,
        -3.3077115913, 2.6097574011, -0.7034186147,
        0.2309699292, -0.3413193965, 1.7076147010);

float power = 2.0;

vec3 oklab2rgb(vec3 oklab) {
    vec3 lms = OKLAB2RGB_A * oklab;
    return OKLAB2RGB_B * (lms * lms * lms);
}

vec4 oklab2rgb(vec4 oklab) {
    return vec4(oklab2rgb(oklab.xyz), oklab.a);
}

vec4 permute(vec4 x) {
    return mod(((x * 34.0) + 1.0) * x, 289.0);
}

vec4 taylorInvSqrt(vec4 r) {
    return 1.79284291400159 - 0.85373472095314 * r;
}

vec3 fade(vec3 t) {
    return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float cnoise(vec3 P) {
    vec3 Pi0 = floor(P); // Integer part for indexing
    vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
    Pi0 = mod(Pi0, 289.0);
    Pi1 = mod(Pi1, 289.0);
    vec3 Pf0 = fract(P); // Fractional part for interpolation
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

    for (int i = 0; i < octaves; i++) {
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

float sierpinskiicosahedron_sdf(vec3 z, int iterations) {
    float scale = power;
    vec3 n1 = normalize(vec3(-GOLDEN_RATIO, GOLDEN_RATIO - 1.0, 1.0));
    vec3 n2 = normalize(vec3(1.0, -GOLDEN_RATIO, GOLDEN_RATIO + 1.0));
    vec3 n3 = normalize(vec3(0.0, 0.0, -1.0));
    vec3 offset = vec3(0.85065, 0.52573, 0.0);
    float orbit_trap = 100000.0;
    float r;
    float t;
    int n = 0;

    z = abs(z);
    t = dot(z, n1);
    if (t > 0.0) z -= 2.0 * t * n1;
    t = dot(z, n2);
    if (t > 0.0) z -= 2.0 * t * n2;
    t = dot(z, n3);
    if (t > 0.0) z -= 2.0 * t * n3;
    t = dot(z, n2);
    if (t > 0.0) z -= 2.0 * t * n2;

    for (; n < iterations; n++) {
        z = abs(z);
        t = dot(z, n1);
        if (t > 0.0) z -= 2.0 * t * n1;
        z = scale * z - offset * (scale - 1.0);

        r = dot(z, z);
        orbit_trap = min(orbit_trap, abs(r));
        if (r > 64.0) break;
    }

    // return vec2(length(z) * pow(scale, float(-n - 1)), orbit_trap).yx;
    return length(z) * pow(scale, float(-n - 1));
}


float smoothUnion(float d1, float d2, float k) {
    // Polynomial smooth minimum (IQ's original implementation)
    float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
    return mix(d2, d1, h) - k * h * (1.0 - h);
}


// Add rotational symmetry (8-fold for realistic diamond facets)
vec2 rotate2(vec2 p, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, -s, s, c) * p;
}

float sdFacetedDiamond(vec3 p, int facets) {
    // Base diamond proportions
    p.y *= 0.65; // Vertical compression
    vec3 q = abs(p);
    float base = (q.x + q.y + q.z - 0.8) * 0.577;

    // Crown facets (top section)
    if (p.y > 0.1) {
        p.xz = rotate2(p.xz, 3.14159 / float(facets));
        float crown = length(p.xz * vec2(1.2, 0.8)) - 0.3;
        base = min(base, crown);
    }

    // Pavilion facets (bottom section)
    if (p.y < -0.2) {
        p.xz = rotate2(p.xz, -3.14159 / float(facets / 2));
        float pavilion = max(abs(p.x) - 0.25, abs(p.z) - 0.25);
        base = min(base, pavilion);
    }

    // Girdle facets using rotati2onal repetition
    for (int i = 0; i < facets; i++) {
        float angle = 6.283 * float(i) / float(facets);
        vec2 rp = rotate2(p.xz, angle);
        float girdleFacet = max(abs(rp.x) - 0.35, abs(p.y) - 0.15);
        base = min(base, girdleFacet);
    }

    return base;
}

float scene(vec3 p) {
    float f = abs(fbm(vec3(uv, u.time / 10.0), 5, 1.0, 0.5)); 
        
    vec3 s = vec3(5.0 + sin(time), 5.0, 5.0 + cnoise(vec3(u.time)) * 0.01);
    vec3 q = p - s*round(p/s);

    float d = sierpinskiicosahedron_sdf(rotate(q , sin(u.time), u.time, u.time * 0.2 ), int(abs(sin(u.time / 10.0) * 10.0)));

    float d2 = length(q) - 1.5;
    return mix(d, d2, 0.01);
    // return length(q) - 1.5;
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

float intensity_clamp(float i, float steepness) {
    return smoothstep(0.0, steepness, i) / steepness;
}

vec3 background_color(vec3 p) {
    vec3 c0 = vec3(0.13, -0.01, -0.07);
    vec3 c1 = vec3(0.16, 0.03, -0.06);
    vec3 c2 = vec3(0.19, 0.05, -0.06);
    vec3 c3 = vec3(0.24, 0.08, -0.05);
    vec3 c4 = vec3(0.30, 0.11, -0.03);
    float t = abs(fbm(p / 5.0 + vec3(u.time / 1.0) * 0.2, 5, 3.0, 0.4));
    if (t < 0.5) {
        return vec3(0.0);
    }
    t = clamp(t, 0.0, 1.0);
    float scaledT = t * 4.0; // Split into 4 intervals
    int index = clamp(int(floor(scaledT)), 0, 3); // Segment index (0-3)
    float fraction = scaledT - float(index); // Local blend factor

    if (index == 3) return mix(c3, c4, fraction);
    else if (index == 2) return mix(c2, c3, fraction);
    else if (index == 1) return mix(c1, c2, fraction);
    return mix(c0, c1, fraction);
}

vec3 weightedOklabAverage(vec4 color1, vec4 color2, vec4 color3, vec4 color4) {
    // Input colors: vec4(weight, L, a, b) in Oklab space
    vec4 colors[4] = vec4[4](color1, color2, color3, color4);

    // Oklab to LMS conversion matrix (cube root space)
    mat3 lab_to_lms = mat3(
            1.0, 1.0, 1.0,
            0.39633777, -0.10556134, -0.08948418,
            0.21580376, -0.06385417, -1.29148555
        );

    // LMS to Oklab conversion matrix
    mat3 lms_to_lab = mat3(
            0.21045426, 1.97799849, 0.02590404,
            0.79361779, -2.42859221, 0.78277177,
            -0.00407205, 0.45059371, -0.80867577
        );

    vec3 sum_lms = vec3(0.0);
    float total_weight = 0.0;

    for (int i = 0; i < 4; i++) {
        float weight = colors[i].x;
        vec3 lab = colors[i].xyz;
        vec3 lms = lab_to_lms * lab;
        sum_lms += lms * weight;
        total_weight += weight;
    }

    vec3 avg_lms = sum_lms / total_weight;
    return lms_to_lab * avg_lms;
}

float sigmoid(float x) {
    return 1.0 / (1.0 + pow(2.0, -x));
}

vec4 follow_ray(vec3 start, vec3 original_direction, int steps) {
    vec3 emerald_color = vec3(0.0, -0.18, 0.05) + vec3(0.0, cnoise(original_direction) * 0.3, 0.0);
    vec3 stormlight_color = vec3(0.0, -0.03, -0.09) + vec3(0.0, cnoise(original_direction) * 0.2, 0.0);
    vec3 voidlight_color = vec3(0.0, 0.08, 0.05);

    float traveled = 0.0;
    vec3 direction = original_direction;
    vec3 light_origin = vec3(10.0, 5.0, 10.0);
    float step_size = 0.02;
    vec3 p = start;
    bool already_inside = false;
    float light_factor = 0.0;
    for (int i = 0; i < steps; ++i) {
        float distance = scene(p);
        if (distance < 0.001) {
            vec3 n = normal(p);
            vec3 l = normalize(p - light_origin);
            if (!already_inside) {
                light_factor = dot(n, l);
                light_factor = max(0.1, light_factor);
                emerald_color.x += light_factor;
            }

            vec3 local_p = rotate(p, u.time, 0.0, 1.0);

            float s = abs(fbm(vec3(local_p.xz, u.time / 10.0), 5, 3.2, 0.5));

            stormlight_color.x += s;

            // stormlight_color.x = clamp(stormlight_color.x, 0.0, 0.8);

            if (direction == original_direction) {
                // direction = reflect(direction, n);
            }
            step_size = 0.002;
            already_inside = true;
        } else {
            step_size = distance;
        }
        traveled += step_size;
        p += direction * step_size;
    }

    stormlight_color.x = sigmoid(stormlight_color.x);
    if (!already_inside) {
        p = start;
        for (int i = 0; i < steps; ++i) {
            vec3 local_p = rotate(p, 0.0, 0.0, 0.0);
            float s = abs(fbm(vec3(local_p.xyz ), 5, 3.2, 0.5));
            if (s > 0.7 && s < 0.9) {
                voidlight_color.x += s;
            }
            p += direction * 0.02;
        }
    }
    voidlight_color.x = sigmoid(voidlight_color.x);
    vec3 background= vec3(0.0);
    if (voidlight_color.x > 0.0) {
        background = background_color(start + original_direction * 20.0);

        background.x *= pow(PI, 1.0+background.x);
    }

    float intensity_sum = emerald_color.x + stormlight_color.x + voidlight_color.x + background.x;

    vec3 color = emerald_color * (emerald_color.x / intensity_sum) + stormlight_color * (stormlight_color.x / intensity_sum) + voidlight_color * (voidlight_color.x / intensity_sum) + background * (background.x / intensity_sum);
    // vec3 color = weightedOklabAverage(vec4(emerald_color, 1.0), vec4(stormlight_color, 1.0), vec4(voidlight_color, 1.0), vec4(background, 3.0));

    return vec4(oklab2rgb(color), 1.0);
}

vec4 render(vec3 eye, vec3 ray) {
    return follow_ray(eye, ray, 20);
}

void main() {
    float fov = fov_factor();
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 ray_direction = rotate(normalize(vec3(pixel_position, 1.0)), sin(u.time * 0.2), u.time * 0.1, 0.0);

    out_color = render(vec3(0.0, 0.0, -4.0) + ray_direction * -u.time, ray_direction);
    // out_color = vec4(pixel_position, 0.0, 1.0);
    // out_color = vec4(sin(sdFbm(vec3(uv * 40.0, 0.0), 7.0)), 0.0, 0.0, 1.0);
}
