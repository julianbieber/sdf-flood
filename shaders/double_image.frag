#version 450
layout(location = 0) out vec4 out_color;

layout(location = 0) in vec2 uv;
layout(binding = 0) uniform UniformParameters {
    float time;
    float o1;
    float o2;
    float o3;
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

float rand2(vec2 x) {
    if (mod(u.time, 4.0 * TAU) < 2.0 * TAU) {
        return fract(sin(dot(x, vec2(12.9898, 78.233))) * 43758.5453123 + u.time);
    }
    return fract(sin(x.x * 2382.0 * x.y * 1786.0 + u.time * sin(u.time * 0.2)));
}

float sdEgg(in vec2 p, in float ra, in float rb) {
    const float k = sqrt(3.0);

    p.x = abs(p.x);

    float r = ra - rb;

    return ((p.y == 0.0) ? length(vec2(p.x, p.y)) - r :
    (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
    length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
}

vec4 yasi(vec2 p) {

    p = p*2.0;

    // background
    vec3 col = vec3(1.0);
    float pi = 3.14159;
    float x = p.x + 0.5;
    float y = p.y + 0.5;
    for (float i = 0.0; i < 4.0; i += 1.00) {
        x = x + i * cos(0.0 + y + cos(1.0 + u.time * 0.1 + pi * x));
        y = y + i * cos(2.0 + x + cos(3.0 + u.time * 0.1 + pi * y));
    }

    float d1 = length(vec2(x, y));
    col = vec3(0.45, 0.25, 0.61);
    if (d1 < 4.5 && d1 > 0.0) {
        col = vec3(0.4, 0.20, 0.42);
    }
    if (d1 < 10.0 && d1 > 6.5) {
        col = vec3(0.4, 0.25, 0.45);
    }
    if (d1 < 0.1 && d1 > 0.0) {
        col = vec3(0.94, 0.77, 0.53);
    }

    //neck
    if (abs(p.x) < 0.35 && p.y < 0.0) {
        col = vec3(0.83, 0.67, 0.76);
    }

    //inside face

    float ra = 0.5;
    float rb = ra * (0.55 + 0.45 * cos(1.0));
    float d = sdEgg(p + vec2(0.0, 0.2), ra, rb);

    col *= 1.0 - exp(-10.0 * abs(d)) * (1.0 - p.y);
    if (d < 0.1) {
        col = vec3(0.83, 0.67, 0.76);
    }

    //left eye
    if (length(p - vec2(0.3, -0.2)) < 0.2 && length(p - vec2(0.25, -0.0)) < 0.2)
    {
        col = vec3(1.0, 1.0, 1.0);

        if (length(p - vec2(0.275, -0.07)) < 0.1) {
            col = vec3(0.94, 0.77, 0.53);
            if (length(p - vec2(0.3, -0.04)) < 0.02) {
                col += vec3(0.1, 0.1, 0.1) * (1.0 - length(p - vec2(0.3, -0.04)) / 0.02);
            }
        }
    }
    if (length(p - vec2(0.29, -0.1)) < 0.2 && length(p - vec2(0.3, -0.12)) > 0.2 && length(p - vec2(0.28, -0.1)) < 0.2)
    {
        col = vec3(0.4, 0.20, 0.42);
    }

    //right eye
    if (length(p - vec2(-0.3, -0.2)) < 0.2 && length(p - vec2(-0.25, -0.0)) < 0.2)
    {
        col = vec3(1.0, 1.0, 1.0);

        if (length(p - vec2(-0.275, -0.07)) < 0.1) {
            col = vec3(0.94, 0.77, 0.53);
            if (length(p - vec2(-0.25, -0.04)) < 0.02) {
                col += vec3(0.1, 0.1, 0.1) * (1.0 - length(p - vec2(-0.25, -0.04)) / 0.02);
            }
        }
    }
    if (length(p - vec2(-0.29, -0.1)) < 0.2 && length(p - vec2(-0.3, -0.12)) > 0.2 && length(p - vec2(-0.28, -0.1)) < 0.2)
    {
        col = vec3(0.4, 0.20, 0.42);
    }

    //nosering
    if (length(p - vec2(-0.05, -0.32)) < 0.02)
    {
        col = vec3(0.4, 0.20, 0.42);
    }
    if (length(p - vec2(0.05, -0.32)) < 0.02)
    {
        col = vec3(0.4, 0.20, 0.42);
    }

    if (length(p - vec2(-0.0, -0.32)) < 0.05 && length(p - vec2(-0.0, -0.32)) > 0.04)
    {
        if (p.y < -0.32) {
            col = vec3(0.94, 0.77, 0.53);
        }
    }
    //mouth

    if (p.y < -0.2 * p.x * p.x - 0.5 && p.y > -0.2 * p.x * p.x - 0.515) {
        if (abs(p.x) < 0.22) {
            col = vec3(0.4, 0.20, 0.42);
        }
    }
    if (p.y < 0.1 * p.x * p.x - 0.57 && p.y > 0.1 * p.x * p.x - 0.5815) {
        if (abs(p.x) < 0.1) {
            col = vec3(0.4, 0.20, 0.42);
        }
    }

    // forgorund

    if (d1 < 2.5 && d1 > 1.8) {
        col = vec3(0.96, 0.85, 0.88);
    }
    return vec4(col, 1.0);
}

struct SceneSample {
    float closest_distance;
    int index;
};

SceneSample combine(SceneSample a, SceneSample b) {
    if (a.closest_distance < 0.0 || (a.index == 6 && a.closest_distance < 0.002)) {
        return a;
    }
    if (b.closest_distance < a.closest_distance) {
        return b;
    } else {
        return a;
    }
}

float dot2(vec2 v) {
    return dot(v, v);
}

vec2 rot(vec2 p, float angle) {
    return mat2(cos(angle), -1.0 * sin(angle), sin(angle), cos(angle)) * p;
}

float eye_1(vec2 p, float r, float d) {
    p = abs(p);

    p = rot(p, PI / 2.0);
    float b = sqrt(r * r - d * d);
    return ((p.y - b) * d > p.x * b) ? length(p - vec2(0.0, b)) : length(p - vec2(-d, 0.0)) - r;
}

float eye_2(vec2 p) {
    p.x = abs(p.x);

    if (p.y + p.x > 1.0) {
        return sqrt(dot2(p - vec2(0.25, 0.75))) - sqrt(2.0) / 4.0;
    }
    return sqrt(min(dot2(p - vec2(0.00, 1.00)),
            dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

float eye(vec2 p, float r, float d, float h, float h2) {
    if (mod(u.time, 2.0 * TAU) < TAU) {
        return eye_1(p, r, d);
    }
    return eye_2((p - vec2(0.0, -0.06 - h2)) / h);
}

float nose_ring(vec2 p, vec2 n, float r, float th) {
    p.x = abs(p.x);
    p = rot(p, PI);

    p = mat2x2(n.x, n.y, -n.y, n.x) * p;

    return max(abs(length(p) - r) - th * 0.5,
        length(vec2(p.x, max(0.0, abs(r - p.y) - th * 0.5))) * sign(p.x));
}

float upper_ring(vec2 p, vec2 n, float r, float th) {
    p.x = abs(p.x);

    p = mat2x2(n.x, n.y, -n.y, n.x) * p;

    return max(abs(length(p) - r) - th * 0.5,
        length(vec2(p.x, max(0.0, abs(r - p.y) - th * 0.5))) * sign(p.x));
}
float egg(vec2 p, float ra, float rb) {
    const float k = sqrt(3.0);
    p.x = abs(p.x);
    float r = ra - rb;
    return ((p.y < 0.0) ? length(vec2(p.x, p.y)) - r :
    (k * (p.x + r) < p.y) ? length(vec2(p.x, p.y - k * r)) :
    length(vec2(p.x + r, p.y)) - 2.0 * r) - rb;
}

float wave(vec2 p, float tb, float ra) {
    if (p.x > -0.27 && p.x < 0.27 && p.y < 0.2) {
        return 100.0;
    }
    float s = 0.1;
    vec2 old_p = p;
    p = p * 4.1;
    if (old_p.x > 0.0) {
        p = rot(p + vec2(0.0, 0.4), -1.10) - s * round(rot(vec2(p.x, p.y), -1.10) / s);
        // p = rot(p, -1.10);
    } else {
        p = rot(p + vec2(0.0, 0.4), 1.10) - s * round(rot(vec2(p.x, p.y), 1.10) / s);
        // p = rot(p, 0.9);
    }

    tb = PI * 5.0 / 6.0 * max(tb, 0.0001);
    vec2 co = ra * vec2(sin(tb), cos(tb));
    p.x = abs(mod(p.x, co.x * 4.0) - co.x * 2.0);
    vec2 p1 = p;
    vec2 p2 = vec2(abs(p.x - 2.0 * co.x), -p.y + 2.0 * co.y);
    float d1 = ((co.y * p1.x > co.x * p1.y) ? length(p1 - co) : abs(length(p1) - ra));
    float d2 = ((co.y * p2.x > co.x * p2.y) ? length(p2 - co) : abs(length(p2) - ra));
    return min(d1, d2);
}

float moon(vec2 p, float d, float ra, float rb) {
    p = rot(p, PI * 1.5);
    p.y = abs(p.y);
    float a = (ra * ra - rb * rb + d * d) / (2.0 * d);
    float b = sqrt(max(ra * ra - a * a, 0.0));
    if (d * (p.x * b - p.y * a) > d * d * max(b - p.y, 0.0))
        return length(p - vec2(a, b));
    return max((length(p) - ra),
        -(length(p - vec2(d, 0)) - rb));
}

vec2 swirl(vec2 p) {
    float swirlFactor = 3.0 + 0.3 * (sin(u.time * 0.1 + 0.22) * 10.0 - 1.5);
    float radius = length(p);
    float angle = atan(p.y, p.x);
    float inner = angle - cos(radius * swirlFactor);
    return vec2(radius * cos(inner), radius * sin(inner));
}

SceneSample julian_map(vec2 p) {
    float eye_left_dist = eye(p + vec2(0.2, 0.0), 0.1, 0.05, 0.1, 0.0);
    SceneSample eye_left = SceneSample(eye_left_dist, 1);

    float eye_right_dist = eye(p - vec2(0.2, 0.0), 0.1, 0.05, 0.1, 0.0);
    SceneSample eye_right = SceneSample(eye_right_dist, 1);

    SceneSample eye_s = combine(eye_left, eye_right);

    float eye_left_dist_l = eye(p + vec2(0.2, 0.0), 0.11, 0.05, 0.12, 0.015);
    SceneSample eye_left_l = SceneSample(eye_left_dist_l, 2);

    float eye_right_dist_l = eye(p - vec2(0.2, 0.0), 0.11, 0.05, 0.12, 0.015);
    SceneSample eye_right_l = SceneSample(eye_right_dist_l, 2);

    SceneSample eye_l = combine(eye_left_l, eye_right_l);

    SceneSample eye = combine(eye_s, eye_l);

    // nose

    float nose_dist = nose_ring((p + vec2(0.0, 0.15)) / 0.05, vec2(1.0), 0.7, 0.2);
    SceneSample nose = SceneSample(nose_dist, 3);

    // mouth

    // upper ring
    float upper_mouth_dist = upper_ring((p + vec2(0.0, 0.3)) / 0.05, vec2(sin(0.2), cos(0.2)), 0.6, 0.5);
    SceneSample upper_mouth = SceneSample(upper_mouth_dist, 4);
    float lower_mouth_dist = nose_ring((p + vec2(0.0, 0.28)) / 0.04, vec2(sin(-0.2), cos(-0.2)), 0.6, 0.7);
    SceneSample lower_mouth = SceneSample(lower_mouth_dist, 4);
    // missing center

    SceneSample mouth = combine(upper_mouth, lower_mouth);

    // head
    float head_dist = egg(p, 0.35, 0.25);
    SceneSample head = SceneSample(head_dist, 5);

    float hair_dist = wave(swirl(p), 0.4, 0.2);
    SceneSample hair = SceneSample(hair_dist, 6);

    float hair_line_dist = moon(p + vec2(0.0, -0.1), 0.3, 0.45, 0.4);
    SceneSample hair_line = SceneSample(hair_line_dist, 7);

    // return hair;
    return combine(hair, combine(hair_line, combine(combine(combine(eye, nose), mouth), head)));
    // return upper_mouth;
}

vec3 hash(vec3 p) // this hash is not production ready, please
{ // replace this by something better
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
            dot(p, vec3(269.5, 183.3, 246.1)),
            dot(p, vec3(113.5, 271.9, 124.6)));

    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise(vec3 x)
{
    // grid
    vec3 p = floor(x);
    vec3 w = fract(x);

    // quintic interpolant
    vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);

    // gradients
    vec3 ga = hash(p + vec3(0.0, 0.0, 0.0));
    vec3 gb = hash(p + vec3(1.0, 0.0, 0.0));
    vec3 gc = hash(p + vec3(0.0, 1.0, 0.0));
    vec3 gd = hash(p + vec3(1.0, 1.0, 0.0));
    vec3 ge = hash(p + vec3(0.0, 0.0, 1.0));
    vec3 gf = hash(p + vec3(1.0, 0.0, 1.0));
    vec3 gg = hash(p + vec3(0.0, 1.0, 1.0));
    vec3 gh = hash(p + vec3(1.0, 1.0, 1.0));

    // projections
    float va = dot(ga, w - vec3(0.0, 0.0, 0.0));
    float vb = dot(gb, w - vec3(1.0, 0.0, 0.0));
    float vc = dot(gc, w - vec3(0.0, 1.0, 0.0));
    float vd = dot(gd, w - vec3(1.0, 1.0, 0.0));
    float ve = dot(ge, w - vec3(0.0, 0.0, 1.0));
    float vf = dot(gf, w - vec3(1.0, 0.0, 1.0));
    float vg = dot(gg, w - vec3(0.0, 1.0, 1.0));
    float vh = dot(gh, w - vec3(1.0, 1.0, 1.0));

    // interpolation
    return va +
        u.x * (vb - va) +
        u.y * (vc - va) +
        u.z * (ve - va) +
        u.x * u.y * (va - vb - vc + vd) +
        u.y * u.z * (va - vc - ve + vg) +
        u.z * u.x * (va - vb - ve + vf) +
        u.x * u.y * u.z * (-va + vb + vc - vd + ve - vf - vg + vh);
}

vec3 background_hair_tex(vec2 p) {
    p = swirl(p);
    vec3 p3 = vec3(p, 0.0);
    float w = 1.0 / wave(fract(p + noise(p3 * 20.0) + (u.time)), 0.2, 0.1) / 10.0 + noise(p3 + vec3(0.0, 0.0, u.time));
    return w * vec3(148.0 / 255.0, 0.0 / 255.0, 211.0 / 255.0);
}

vec3 julian_color(SceneSample s, vec2 p) {
    if (s.index == 6 && s.closest_distance < 0.002) {
        return vec3(0.4 + (1.0 / (s.closest_distance + 0.4)));
    }
    s.closest_distance += (noise(vec3(p * 1000.0, 0.0)) - 0.5) * 0.01;
    // if (p.y > 0.2 && -1.0 * (pow(abs(p.x), 1.2)) + 0.3 < p.y) {
    //     return background_hair_tex(p);
    // }
    if (s.index == 1 && s.closest_distance < 0.0) {
        return vec3(0.94, 0.77, 0.53);
    }
    if (s.index == 2 && s.closest_distance < 0.0) {
        return vec3(1.0);
    }
    if (s.index == 3 && s.closest_distance < 0.0) {
        return vec3(0.0, 0.0, 1.0);
    }
    if (s.index == 4 && s.closest_distance < 0.0) {
        return vec3(1.0, 0.0, 0.0);
    }
    if (s.index == 5 && s.closest_distance < 0.0) {
        return vec3(108.0 / 255.0, 70.0 / 255.0, 117.0 / 255.0);
    }
    if (s.index == 7 && s.closest_distance < 0.0) {
        return background_hair_tex(p) * 1.1;
    }

    if (abs(0.1 / p.x) - 1.0 > p.y && p.y < 0.2) {
        return vec3(108.0 / 255.0, 70.0 / 255.0, 117.0 / 255.0) * mix(0.6, 4.0, length(p) - 0.4);
    }

    return background_hair_tex(p);
}

vec4 julian(vec2 p) {
    SceneSample s = julian_map(p - vec2(0.0, 0.1));
    return vec4(julian_color(s, p) + (noise(vec3(rot(p, u.time * 0.1), 0.1)) - 0.5), 1.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;

    if (rand2(pixel_position) < (cos(u.time) + 1.0) / 2.0) {
        out_color = yasi(pixel_position);
    } else {
        out_color = julian(pixel_position);
    }
}
