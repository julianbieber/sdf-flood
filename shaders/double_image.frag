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

float rand2(vec2 x) {
    if (mod(u.time, 4.0 * TAU) < 2.0 * TAU) {
        return fract(sin(dot(x, vec2(12.9898, 78.233))) * 43758.5453123 + u.time);
    }
    return fract(sin(x.x * 2382.0 * x.y * 1786.0 + u.time * sin(u.time * 0.2)));
}

vec4 yasi(vec2 p) {
    return vec4(1.0);
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

    float hair_dist = wave(p, 0.4, 0.2);
    SceneSample hair = SceneSample(hair_dist, 6);

    // return hair;
    return combine(hair, combine(combine(combine(eye, nose), mouth), head));
    // return upper_mouth;
}

vec3 julian_color(SceneSample s, vec2 p) {
    if (s.index == 6 && s.closest_distance < 0.002) {
        return vec3(0.4 + (1.0 / (s.closest_distance + 0.4)));
    }
    float wave_dist = 1.0;
    // if (p.x > 0.0) {
    //     wave_dist = wave(rot(vec2(abs(p.x), p.y), PI / 1.3), 0.3, 0.3);
    // } else {
    //     wave_dist = wave(rot(vec2(abs(p.x), p.y), PI / 2.3), 0.3, 0.3);
    // }
    // if (p.y > 0.2 && -1.0 * (pow(abs(p.x), 1.2)) + 0.3 < p.y) {
    //     if (wave_dist < 0.001) {
    //         return vec3(0.1);
    //     }
    //     return vec3(wave(p, 1.0, 1.0));
    // }
    if (s.index == 1 && s.closest_distance < 0.0) {
        return vec3(1.0, 0.0, 0.0);
    }
    if (s.index == 2 && s.closest_distance < 0.0) {
        return vec3(0.0, 1.0, 0.0);
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

    if (abs(0.1 / p.x) - 1.0 > p.y && p.y < 0.2) {
        return vec3(108.0 / 255.0, 70.0 / 255.0, 117.0 / 255.0) * mix(0.6, 4.0, length(p) - 0.4);
    }

    return vec3(0.2);
}

vec4 julian(vec2 p) {
    SceneSample s = julian_map(p - vec2(0.0, 0.1));
    return vec4(julian_color(s, p), 1.0);
}

void main() {
    vec2 pixel_position = ((uv - 0.5) * vec2(1.92, 1.2)) / 1.2;

    if (rand2(pixel_position) < (cos(u.time) + 1.0) / 2.0) {
        out_color = yasi(pixel_position);
    } else {
        out_color = julian(pixel_position);
    }
}
