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

vec3 rotate(vec3 p, float yaw, float pitch, float roll) {
    return (mat3(cos(yaw), -sin(yaw), 0.0, sin(yaw), cos(yaw), 0.0, 0.0, 0.0, 1.0) *
        mat3(cos(pitch), 0.0, sin(pitch), 0.0, 1.0, 0.0, -sin(pitch), 0.0, cos(pitch)) *
        mat3(1.0, 0.0, 0.0, 0.0, cos(roll), -sin(roll), 0.0, sin(roll), cos(roll))) *
        p;
}
float sphere(vec3 p, vec3 center, float radius) {
    return length(p - center) - radius;
}

float hash(vec3 p) {
    return fract(dot(sin(p), vec3(1124.0, 1236147.0, 123214.0)));
}

float vnoise(vec3 p) {
    // Get integer coordinates of the cube's origin corner
    vec3 i = floor(p);
    // Get fractional coordinates within the cube
    vec3 f = fract(p);

    // Apply smooth interpolation weights (Hermite curve)
    vec3 u = f * f * (3.0 - 2.0 * f);

    // Get random values for the 8 corners of the cube
    float c000 = hash(i + vec3(0.0, 0.0, 0.0));
    float c100 = hash(i + vec3(1.0, 0.0, 0.0));
    float c010 = hash(i + vec3(0.0, 1.0, 0.0));
    float c110 = hash(i + vec3(1.0, 1.0, 0.0));
    float c001 = hash(i + vec3(0.0, 0.0, 1.0));
    float c101 = hash(i + vec3(1.0, 0.0, 1.0));
    float c011 = hash(i + vec3(0.0, 1.0, 1.0));
    float c111 = hash(i + vec3(1.0, 1.0, 1.0));

    // Perform trilinear interpolation using the smoothed weights 'u'
    float interp_x00 = mix(c000, c100, u.x); // Interpolate along x for bottom-front edge
    float interp_x10 = mix(c010, c110, u.x); // Interpolate along x for bottom-back edge
    float interp_x01 = mix(c001, c101, u.x); // Interpolate along x for top-front edge
    float interp_x11 = mix(c011, c111, u.x); // Interpolate along x for top-back edge

    float interp_y0 = mix(interp_x00, interp_x10, u.y); // Interpolate along y for bottom face
    float interp_y1 = mix(interp_x01, interp_x11, u.y); // Interpolate along y for top face

    float final_interp = mix(interp_y0, interp_y1, u.z); // Interpolate along z between faces

    return final_interp;
}

float fbm(vec3 x, float H) {
    float t = 0.0;
    for (int i = 0; i < 3; i++)
    {
        float f = pow(2.0, float(i));
        float a = pow(f, -H);
        t += a * vnoise(f * x);
    }
    return t;
}

float map(vec3 p) {
    // vec3 l = rotate(p, 0.0, u.time * 0.2, 0.0);
    vec3 l = p;
    // float d2 = (l.y + 10.0 - fbm(l, 6.5));
    float d1 = p.y - 1.0 - (sin(p.x + u.time) * 0.2);

    // return min(d1, d2);
    return d1;
}

vec3 normal(in vec3 p) // for function f(p)
{
    const float eps = 0.0001; // or some other value
    const vec2 h = vec2(eps, 0);
    return normalize(vec3(map(p + h.xyy) - map(p - h.xyy),
            map(p + h.yxy) - map(p - h.yxy),
            map(p + h.yyx) - map(p - h.yyx)));
}

vec2 rot2(vec2 p, float a) {
    float c = cos(a), s = sin(a);
    return mat2(c, -s, s, c) * p;
}

vec3 swirl(vec3 p) {
    for (float a = 1.; a < exp2(9.); a *= 2.) {
        p += cos(p.yzx * a + u.time) / a;
    }
    return p;
}

vec3 cmap(float x) {
    return pow(.5 + .5 * cos(PI * x + vec3(2.0, 1.0, 3.0)), vec3(2.5)) * vec3(0.3, 1.5, 1.6);
}

void main() {
    vec2 pixel = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;
    vec3 rd = normalize(vec3(pixel, -1.0));
    vec3 ro = vec3(0.0, 0.0, -10.0);
    vec3 ref = vec3(0.0);

    float travel = 0.0;
    out_color = vec4(0.0);

    vec3 sky_color_agg = vec3(0.0);
    float distance_in_sky = 0.0;
    vec3 sea_color = vec3(0.0);
    for (int i = 0; i < 200; i = i + 1) {
        vec3 p = ro + rd * travel;
        if (p.y > 2.0) {
            vec3 local_ro = ro + rd * ((2.0 + ro.y) / max(0.1, abs(rd.y)));
            // p.xy = rot2(p.xy, u.time + length(p - local_ro) / 5.0);
            p = swirl(p);
            float d = 1. / 50. + abs((local_ro - p).y);

            // float d = abs((local_ro - p - vec3(0, 1, 0)).y - 1.) / 10.;
            sky_color_agg += cmap(length(p - local_ro)) * 2e-3 / d;
            travel += d;
        } else {
            float d = map(p);
            if (d < 0.001) {
                vec3 n = normal(p);
                float l = max(0.0, dot(n, normalize(vec3(10.0, 10.0, 0.0))));
                sea_color = vec3(l*0.5, -0.12, -0.06);
                ro = p;
                rd = reflect(rd, n);
                travel = 0.0;
            } else {
                travel += d * 0.5;
            }
        }

        if (travel > 200.0) {
            break;
        }
    }

    sky_color_agg *= sky_color_agg * sky_color_agg;
    sky_color_agg = 1. - exp(-sky_color_agg);
    sky_color_agg = pow(sky_color_agg, vec3(1. / 2.2));
    float s = min(1.0, sky_color_agg.x + sky_color_agg.y + sky_color_agg.z);
    vec3 sky_color = vec3(0.0);
    if (s > 0.01) {
        vec3 c1 = vec3(s, -0.03, -0.09) * sky_color_agg.x / s;
        vec3 c2 = vec3(s, 0.21, 0.13) * sky_color_agg.y / s;
        vec3 c3 = vec3(s, -0.13, 0.09) * sky_color_agg.z / s;
        sky_color = c1 + c2 + c3;
        // out_color = vec4(sky_color_agg, 1.0);
    }

    if (sea_color.x != 0.0 || sky_color.x != 0.0) {
        vec3 ok_color = mix(sky_color, sea_color, sea_color.x / (sea_color.x + sky_color.x));
        out_color = vec4(oklab2rgb(ok_color), 1.0);
    }

    // out_color = vec4(cmap((uv.x - 0.5) * 5.0), 1.0);
}
