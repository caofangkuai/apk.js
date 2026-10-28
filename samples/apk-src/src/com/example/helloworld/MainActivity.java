package com.example.helloworld;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import java.lang.reflect.Method;

public class MainActivity extends Activity {

    private int clicks = 0;
    private int addedRows = 0;
    private int progress = 0;
    private TextView title;
    private TextView subtitle;
    private TextView count;
    private Button action;
    private EditText echoInput;
    private TextView echoOutput;
    private LinearLayout dynamicList;
    private ProgressBar progressBar;
    private TextView progressLabel;
    private TextView pillResult;
    private TextView buildOutput;
    private TextView reflectOutput;
    private TextView activityOutput;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        title = (TextView) findViewById(R.id.title);
        subtitle = (TextView) findViewById(R.id.subtitle);
        count = (TextView) findViewById(R.id.count);
        action = (Button) findViewById(R.id.action);
        echoInput = (EditText) findViewById(R.id.echo_input);
        echoOutput = (TextView) findViewById(R.id.echo_output);
        dynamicList = (LinearLayout) findViewById(R.id.dynamic_list);
        progressBar = (ProgressBar) findViewById(R.id.progress);
        progressLabel = (TextView) findViewById(R.id.progress_label);
        pillResult = (TextView) findViewById(R.id.pill_result);
        buildOutput = (TextView) findViewById(R.id.build_output);
        reflectOutput = (TextView) findViewById(R.id.reflect_output);
        activityOutput = (TextView) findViewById(R.id.activity_output);

        title.setText("Hello World");
        subtitle.setText(getResources().getString(R.string.hint));
        action.setText(getResources().getString(R.string.action));

        action.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                clicks = clicks + 1;
                count.setText("已点击 " + clicks + " 次");
                if (clicks == 1) {
                    Toast.makeText(MainActivity.this, "DEX 方法被调用了", Toast.LENGTH_SHORT).show();
                } else {
                    Toast.makeText(MainActivity.this, "点击次数: " + clicks, Toast.LENGTH_SHORT).show();
                }
                if (clicks >= 5) {
                    action.setText("再来一次");
                    subtitle.setText("事件分发链路已跑通");
                }
            }
        });

        Button echoAction = (Button) findViewById(R.id.echo_action);
        echoAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                String text = echoInput.getText().toString();
                if (text == null || text.length() == 0) {
                    echoOutput.setText(getResources().getString(R.string.echo_empty));
                } else {
                    echoOutput.setText("你输入了：" + text);
                }
            }
        });

        Button addAction = (Button) findViewById(R.id.add_action);
        addAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                addedRows = addedRows + 1;
                TextView row = new TextView(MainActivity.this);
                row.setText(getResources().getString(R.string.added_prefix) + addedRows);
                row.setTextColor(0xFF1A73E8);
                row.setTextSize(15);
                LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                        LinearLayout.LayoutParams.WRAP_CONTENT,
                        LinearLayout.LayoutParams.WRAP_CONTENT);
                params.topMargin = 6;
                row.setLayoutParams(params);
                dynamicList.addView(row);
            }
        });

        Button progressAction = (Button) findViewById(R.id.progress_action);
        progressAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                progress = progress + 10;
                if (progress > 100) {
                    progress = 0;
                }
                progressBar.setProgress(progress);
                progressLabel.setText("进度：" + progress + "%");
            }
        });

        Button pillAction = (Button) findViewById(R.id.pill_action);
        pillAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pillResult.setText(getResources().getString(R.string.pill_done));
            }
        });

        Button buildAction = (Button) findViewById(R.id.build_action);
        buildAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                buildOutput.setText(
                        "MANUFACTURER=" + Build.MANUFACTURER
                                + " MODEL=" + Build.MODEL
                                + " SDK=" + Build.VERSION.SDK_INT
                                + " RELEASE=" + Build.VERSION.RELEASE);
            }
        });

        Button reflectAction = (Button) findViewById(R.id.reflect_action);
        reflectAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                try {
                    Class<?> cls = Class.forName("com.example.helloworld.MainActivity");
                    Method method = cls.getMethod("describe", new Class<?>[] { int.class });
                    Object result = method.invoke(MainActivity.this, Integer.valueOf(42));
                    reflectOutput.setText("反射调用结果：" + result);
                } catch (Exception e) {
                    reflectOutput.setText("反射失败：" + e);
                }
            }
        });

        Button activityAction = (Button) findViewById(R.id.activity_action);
        activityAction.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                Intent intent = new Intent(MainActivity.this, SecondActivity.class);
                intent.putExtra(SecondActivity.EXTRA_MESSAGE, "来自 MainActivity 的问候");
                activityOutput.setText("正在打开第二个页面…");
                startActivity(intent);
            }
        });

        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                subtitle.setText(getResources().getString(R.string.hint));
            }
        }, 350);
    }

    public String describe(int value) {
        return "describe(" + value + ") -> " + (value * 2);
    }

    @Override
    protected void onResume() {
        super.onResume();
    }
}
